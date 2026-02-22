#!/usr/bin/env node
/**
 * Generates PDFs for all articles in ai-security-site/articles/.
 * Output: ai-security-site/pdfs/<article-name>.pdf
 * Run from repo root: node ai-security-site/generate-article-pdfs.js
 */
const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_DIR = path.join(__dirname);
const ARTICLES_DIR = path.join(SITE_DIR, 'articles');
const PDFS_DIR = path.join(SITE_DIR, 'pdfs');

const ARTICLES = [
  { html: 'data-poisoning.html', pdf: 'data-poisoning.pdf' },
  { html: 'api-security.html', pdf: 'api-security.pdf' },
  { html: 'prompt-injection.html', pdf: 'pinjection.pdf' },
];

async function serveDir(dir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url === '/' ? '/index.html' : req.url;
      const filePath = path.join(dir, decodeURIComponent(urlPath).replace(/^\//, ''));
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.ico': 'image/x-icon',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function makePDF(page, url, outPath) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
  });
}

(async () => {
  if (!fs.existsSync(PDFS_DIR)) {
    fs.mkdirSync(PDFS_DIR, { recursive: true });
    console.log('Created', PDFS_DIR);
  }

  const PORT = 19824;
  const server = await serveDir(SITE_DIR, PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log('Serving site at', baseUrl);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const { html, pdf } of ARTICLES) {
      const htmlPath = path.join(ARTICLES_DIR, html);
      if (!fs.existsSync(htmlPath)) {
        console.warn('Skip (not found):', html);
        continue;
      }
      const url = `${baseUrl}/articles/${html}`;
      const outPath = path.join(PDFS_DIR, pdf);
      console.log('Generating:', pdf);
      await makePDF(page, url, outPath);
      const stat = fs.statSync(outPath);
      console.log('  ->', outPath, `(${(stat.size / 1024).toFixed(1)} kB)`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Done.');
})();
