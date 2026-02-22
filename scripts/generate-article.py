#!/usr/bin/env python3
"""
Secure by DeZign — Daily Article Generator
Picks the next topic, generates HTML + hero image, updates index.html + sitemap, syncs to S3.
"""

import json, os, sys, subprocess, urllib.request, urllib.error, base64, re, shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
WORKSPACE       = Path(__file__).parent.parent
SITE_DIR        = WORKSPACE / "securebydezign.com"
TOPICS_FILE     = WORKSPACE / "scripts" / "article-topics.json"
S3_BUCKET       = "s3://securebydezign.com"
STRIPE_PRICE_ID = "price_1T3MaiB50TQ4M7eD4geVxBoD"
STRIPE_PUB_KEY  = "pk_live_51T3MFdB50TQ4M7eDzNU6jLJcucY4puhhw67IqguzSQlXpcGQiZkCvDYD9VOr1ZmiF7cqMt5NUJKJIo6E5EIgQTKY00xpjIXmEy"
STRIPE_LINK     = "https://buy.stripe.com/aFadR8gDw2jm4UM6atb7y00"
SITE_BASE_URL   = "https://www.securebydezign.com"

ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_KEY      = os.environ.get("OPENAI_API_KEY", "")

# Load local secrets (never committed, never synced to S3)
_env_local = WORKSPACE / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

PST = timezone(timedelta(hours=-8))

def log(msg): print(f"[generate-article] {msg}", flush=True)

# ── API helpers ───────────────────────────────────────────────────────────────
def anthropic_complete(prompt: str, system: str, max_tokens: int = 8000) -> str:
    payload = json.dumps({
        "model": "claude-opus-4-5",
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["content"][0]["text"]

def openai_image(prompt: str, out_path: Path):
    """Generate a 1792x1024 hero image via DALL-E 3 and save as JPEG."""
    payload = json.dumps({
        "model": "dall-e-3",
        "prompt": prompt,
        "n": 1,
        "size": "1792x1024",
        "quality": "standard",
        "response_format": "b64_json"
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    img_b64 = data["data"][0]["b64_json"]
    img_bytes = base64.b64decode(img_b64)
    out_path.write_bytes(img_bytes)
    log(f"Image saved: {out_path} ({len(img_bytes)//1024} KB)")

def run(cmd: list, **kwargs) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout.strip()

# ── Topic management ──────────────────────────────────────────────────────────
def pick_topic() -> dict:
    data = json.loads(TOPICS_FILE.read_text())
    queue = data.get("queue", [])
    if not queue:
        raise RuntimeError("Topic queue is empty — add more topics to article-topics.json")
    topic = queue[0]
    return topic

def mark_published(slug: str):
    data = json.loads(TOPICS_FILE.read_text())
    data["queue"] = [t for t in data["queue"] if t["slug"] != slug]
    data["published"].append(slug)
    TOPICS_FILE.write_text(json.dumps(data, indent=2))
    log(f"Marked published: {slug}")

# ── Article HTML generation ───────────────────────────────────────────────────
def today_str() -> str:
    return datetime.now(PST).strftime("%-d %b %Y")

def generate_article_html(topic: dict) -> str:
    slug        = topic["slug"]
    title       = topic["title"]
    description = topic["description"]
    icon        = topic.get("icon", "fa-shield-alt")
    date_str    = today_str()

    system = """You are Pax — a senior cybersecurity architect with decades of experience in enterprise security, AI/ML security, and agentic AI governance. You write authoritative, technically precise security articles for Secure by DeZign, an AI security blog.

You write in a sharp, direct style: no filler, no hype, no fear-mongering. You cite real attack patterns, practical defenses, and reference NIST frameworks where relevant. Your audience is security professionals and engineers."""

    prompt = f"""Write a complete HTML article for Secure by DeZign on the topic: "{title}"

Topic description: {description}

CRITICAL: Return ONLY the inner article content — no <html>, <head>, <body>, or <nav> tags. Start directly with the <div class="article-meta"> and end with the final CTA div. I will wrap it in the page template.

The article must follow this EXACT structure and use these EXACT CSS patterns:

1. Meta line:
<div class="article-meta text-emerald-400 text-sm mb-8">DATE • X min read</div>

2. H1 title (SEO-optimized, includes "2026"):
<h1>Full Title Here – Complete Guide 2026</h1>

3. Lead paragraph (class="lead") — strong hook, 2-3 sentences, what the article covers and why it matters now.

4. An SVG diagram in a <figure class="article-fig"> with <div class="diagram-wrap"> — must be a meaningful inline SVG (viewBox, dark theme: bg #27272a, borders #3f3f46, accent #10b981, text #e4e4e7) illustrating the core concept. Include a <figcaption>.

5. "In this guide" box (class="in-this-guide teaser-only") — 3-4 bullet points previewing what's covered.

6. Section 1 — h2 with class="with-icon" and a Font Awesome icon: <h2 class="with-icon"><i class="fas fa-ICON section-icon" aria-hidden="true"></i> Section Title</h2>
   - 2-3 paragraphs of substantive content visible on web (teaser)
   - A pdf-only div with attack/defense code examples in <pre><code> blocks with .code-caption labels

7. Mid-article CTA (teaser-only):
<div class="article-cta teaser-only text-center my-10">
  <a href="STRIPE_LINK" class="inline-flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-semibold transition">
    <i class="fas fa-credit-card"></i> Buy Guide for $27
  </a>
</div>

8. Section 2 — same h2 pattern. Teaser paragraph + teaser-note pointing to PDF. Full detail in pdf-only div.

9. Section 3 — same pattern. Include a second SVG diagram (pdf-only) showing a defense architecture or layered control.

10. Summary section — teaser-only paragraph + teaser-note. pdf-only: a .callout div with golden rule, action checklist <ul>, and closing paragraph about continuous improvement.

11. Bottom CTA:
<div class="article-cta mt-16 pt-10 border-t border-zinc-700 text-center">
  <a href="STRIPE_LINK" class="inline-flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-5 rounded-3xl font-semibold text-xl transition">
    <i class="fas fa-credit-card"></i> Buy Full Guide for $27
  </a>
</div>

Key rules:
- Replace STRIPE_LINK with: {STRIPE_LINK}
- Replace DATE with: {date_str}
- The article must be substantive and technically authoritative — real attack vectors, real NIST/framework references, real defensive patterns
- teaser-only content shows on web, pdf-only shows in print/PDF
- Use Font Awesome icons for section headings (fas fa-*)
- Write at least 400 words of visible teaser content and 800+ words of pdf-only content
- Code examples should be realistic, specific, and labeled with .code-caption
- SVGs must use the dark theme: background #27272a, stroke/border #3f3f46, accent green #10b981, text #e4e4e7 or #ffffff
- Do NOT use markdown — pure HTML only"""

    log("Generating article content via Claude...")
    raw = anthropic_complete(prompt, system, max_tokens=8000)

    # Wrap in full page template
    meta_desc = description
    page_title = f"{title} – Complete Guide 2026 • Secure by DeZign"
    canonical  = f"{SITE_BASE_URL}/articles/{slug}.html"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{meta_desc}">
  <title>{page_title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="../css/article.css">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="canonical" href="{canonical}">
</head>
<body class="bg-zinc-950 text-zinc-200">
  <nav class="border-b border-zinc-800 bg-zinc-950">
    <div class="max-w-4xl mx-auto px-6 py-5">
      <a href="../index.html" class="flex items-center gap-2 hover:text-emerald-400"><i class="fas fa-arrow-left"></i> Back to Home</a>
    </div>
  </nav>

  <article class="article-body max-w-4xl mx-auto px-6 py-16">
    {raw}
  </article>
  <script src="{slug}-stripe.js"></script>
</body>
</html>"""
    return html

# ── Stripe JS ─────────────────────────────────────────────────────────────────
def generate_stripe_js(slug: str) -> str:
    btn_id = f"checkout-button-{slug.replace('-', '_')}"
    return f"""const stripe = Stripe('{STRIPE_PUB_KEY}');

document.addEventListener('DOMContentLoaded', function() {{
  const buttons = document.querySelectorAll('#{btn_id}, #{btn_id}-full');
  buttons.forEach(button => {{
    button.addEventListener('click', async function() {{
      const {{error}} = await stripe.redirectToCheckout({{
        lineItems: [{{price: '{STRIPE_PRICE_ID}', quantity: 1}}],
        mode: 'payment',
        successUrl: '{SITE_BASE_URL}/success.html',
        cancelUrl: '{SITE_BASE_URL}/articles/{slug}.html',
      }});
      if (error) {{
        console.error(error);
        alert('Error redirecting to checkout: ' + error.message);
      }}
    }});
  }});
}});
"""

# ── index.html update ─────────────────────────────────────────────────────────
def update_index(topic: dict):
    slug        = topic["slug"]
    title       = topic["title"]
    description = topic["description"]
    icon        = topic.get("icon", "fa-shield-alt")

    index_path = SITE_DIR / "index.html"
    content    = index_path.read_text()

    new_card = f"""
      <div class="bg-zinc-900 rounded-3xl overflow-hidden card-hover">
        <img src="images/{slug}.jpg" alt="{title}" class="w-full h-48 object-cover">
        <div class="p-8">
          <h2 class="text-2xl font-semibold mb-3">{title}</h2>
          <p class="text-zinc-400 mb-6 line-clamp-3">{description}</p>
          <a href="articles/{slug}.html" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-2xl font-medium transition">
            Read Full Article <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      </div>"""

    # Insert before closing </div> of the grid
    content = content.replace(
        "    </div>\n  </div>\n\n  <footer",
        f"    </div>{new_card}\n    </div>\n  </div>\n\n  <footer"
    )
    index_path.write_text(content)
    log(f"Updated index.html with card for: {slug}")

# ── sitemap.xml update ────────────────────────────────────────────────────────
def update_sitemap(slug: str):
    sitemap_path = SITE_DIR / "sitemap.xml"
    content      = sitemap_path.read_text()
    today        = datetime.now(PST).strftime("%Y-%m-%d")
    new_entry    = f"  <url><loc>{SITE_BASE_URL}/articles/{slug}.html</loc><lastmod>{today}</lastmod></url>\n"

    # Update lastmod on homepage and insert new article entry
    content = re.sub(r'(<url><loc>[^<]+</loc><lastmod>)[^<]+(</lastmod></url>)',
                     lambda m: m.group(1) + today + m.group(2), content, count=1)
    content = content.replace("</urlset>", new_entry + "</urlset>")
    sitemap_path.write_text(content)
    log(f"Updated sitemap.xml with: {slug}")

# ── PDF generation ────────────────────────────────────────────────────────────
def generate_pdf(slug: str):
    pdf_script = SITE_DIR / "generate-article-pdfs.js"
    # Create a one-off PDF gen script for this single article
    single_script = SITE_DIR / f"_gen-pdf-{slug}.js"
    script_content = f"""
const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_DIR = '{str(SITE_DIR)}';

async function serveDir(dir, port) {{
  return new Promise((resolve) => {{
    const server = http.createServer((req, res) => {{
      const urlPath = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(dir, decodeURIComponent(urlPath).replace(/^\\//, ''));
      fs.readFile(filePath, (err, data) => {{
        if (err) {{ res.writeHead(404); res.end('not found'); return; }}
        const ext = path.extname(filePath).toLowerCase();
        const types = {{ '.html':'text/html','.css':'text/css','.js':'application/javascript',
          '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml' }};
        res.writeHead(200, {{ 'Content-Type': types[ext] || 'application/octet-stream' }});
        res.end(data);
      }});
    }});
    server.listen(port, '127.0.0.1', () => resolve(server));
  }});
}}

(async () => {{
  const PORT = 19825;
  const server = await serveDir(SITE_DIR, PORT);
  const browser = await puppeteer.launch({{ headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] }});
  try {{
    const page = await browser.newPage();
    await page.setViewport({{ width: 1280, height: 900 }});
    await page.goto('http://127.0.0.1:' + PORT + '/articles/{slug}.html',
      {{ waitUntil: 'networkidle0', timeout: 60000 }});
    await new Promise(r => setTimeout(r, 1500));
    const outPath = path.join(SITE_DIR, 'pdfs', '{slug}.pdf');
    await page.pdf({{ path: outPath, format: 'A4', printBackground: true,
      margin: {{ top: '24px', right: '24px', bottom: '24px', left: '24px' }} }});
    const stat = fs.statSync(outPath);
    console.log('PDF:', outPath, '(' + (stat.size/1024).toFixed(1) + ' kB)');
  }} finally {{
    await browser.close();
    server.close();
  }}
}})();
"""
    single_script.write_text(script_content)
    try:
        log(f"Generating PDF for {slug}...")
        out = run(["node", str(single_script)], cwd=str(WORKSPACE))
        log(out)
    finally:
        single_script.unlink(missing_ok=True)

# ── S3 sync ───────────────────────────────────────────────────────────────────
def sync_to_s3():
    log("Syncing to S3...")
    out = run([
        "aws", "s3", "sync",
        str(SITE_DIR), S3_BUCKET,
        "--delete",
        "--exclude", "generate-article-pdfs.js",
        "--cache-control", "max-age=300"
    ])
    log(out or "Sync complete.")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log("=== Secure by DeZign — Daily Article Generator ===")

    # 1. Pick topic
    topic = pick_topic()
    slug  = topic["slug"]
    log(f"Topic: {topic['title']} ({slug})")

    # 2. Generate hero image
    img_path = SITE_DIR / "images" / f"{slug}.jpg"
    if not img_path.exists():
        log("Generating hero image via DALL-E 3...")
        openai_image(topic["imagePrompt"], img_path)
    else:
        log(f"Hero image already exists: {img_path}")

    # 3. Generate article HTML
    html = generate_article_html(topic)
    article_path = SITE_DIR / "articles" / f"{slug}.html"
    article_path.write_text(html)
    log(f"Article written: {article_path}")

    # 4. Generate Stripe JS
    stripe_js = generate_stripe_js(slug)
    stripe_path = SITE_DIR / "articles" / f"{slug}-stripe.js"
    stripe_path.write_text(stripe_js)
    log(f"Stripe JS written: {stripe_path}")

    # 5. Generate PDF
    generate_pdf(slug)

    # 6. Update index.html
    update_index(topic)

    # 7. Update sitemap.xml
    update_sitemap(slug)

    # 8. Mark published
    mark_published(slug)

    # 9. Sync to S3
    sync_to_s3()

    log(f"=== Done. Published: {SITE_BASE_URL}/articles/{slug}.html ===")

if __name__ == "__main__":
    main()
