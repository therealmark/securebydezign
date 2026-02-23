#!/usr/bin/env python3
"""
check-credits.py
----------------
Checks the health/balance of each configured LLM provider API key.
Outputs JSON to stdout.

Per-provider approach:
  OpenAI   — tries GET /v1/organization/balance (admin billing endpoint);
             falls back to a $0.00001 test completion if that 404s.
  Anthropic — no public balance API; makes a 1-token test call.
  xAI       — no public balance API; makes a 1-token test call.

Exit code:
  0  — at least one provider is usable
  1  — all providers are exhausted/broken
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ── Load secrets ────────────────────────────────────────────────────────────
_env_file = Path(__file__).parent.parent / ".env.local"
_env: dict[str, str] = {}
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        if "=" in _line and not _line.startswith("#"):
            _k, _, _v = _line.partition("=")
            _env[_k.strip()] = _v.strip()

OPENAI_KEY    = _env.get("OPENAI_API_KEY", "")
ANTHROPIC_KEY = _env.get("ANTHROPIC_API_KEY", "")
XAI_KEY       = _env.get("XAI_API_KEY", "")

# ── Helpers ──────────────────────────────────────────────────────────────────
def _get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, e
    except Exception as ex:
        return None, ex


def _post(url, headers, body):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json", **headers}
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, e
    except Exception as ex:
        return None, ex


def _is_quota_err(e):
    if not isinstance(e, urllib.error.HTTPError):
        return False
    body = ""
    try:
        body = e.read().decode()
    except Exception:
        pass
    quota_codes = {402, 429, 529}
    quota_words = {"quota", "credit", "balance", "insufficient", "exceeded", "billing"}
    if e.code in quota_codes:
        return True
    if any(w in body.lower() for w in quota_words):
        return True
    return False


# ── OpenAI ───────────────────────────────────────────────────────────────────
def check_openai() -> dict:
    if not OPENAI_KEY:
        return {"status": "no_key"}

    # Attempt 1: official balance endpoint (works for org/project admin keys)
    data, err = _get(
        "https://api.openai.com/v1/organization/balance",
        {"Authorization": f"Bearer {OPENAI_KEY}"},
    )
    if data is not None:
        available = data.get("available", [])
        total = sum(e.get("amount", 0) for e in available) if available else None
        return {
            "status": "ok",
            "balance_usd": round(total, 4) if total is not None else "unknown",
            "source": "billing_api",
        }

    if isinstance(err, urllib.error.HTTPError) and err.code in (401, 403):
        return {"status": "auth_error", "detail": f"HTTP {err.code}"}

    # Attempt 2: cheapest possible test call (gpt-4o-mini, 1 token)
    data2, err2 = _post(
        "https://api.openai.com/v1/chat/completions",
        {"Authorization": f"Bearer {OPENAI_KEY}"},
        {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
    )
    if data2 is not None:
        return {
            "status": "ok",
            "balance_usd": "unknown (billing API returned 404)",
            "source": "test_call_ok",
        }
    if _is_quota_err(err2):
        return {"status": "exhausted", "note": "quota exceeded or credits gone"}
    return {"status": "error", "detail": str(err2)[:200]}


# ── Anthropic ─────────────────────────────────────────────────────────────────
def check_anthropic() -> dict:
    if not ANTHROPIC_KEY:
        return {"status": "no_key"}

    data, err = _post(
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01"},
        {
            "model": "claude-haiku-4-5",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    if data is not None:
        return {
            "status": "ok",
            "balance_usd": "unknown (no billing API)",
            "source": "test_call_ok",
        }
    if _is_quota_err(err):
        return {"status": "exhausted", "note": "credits exhausted or rate-limited"}
    if isinstance(err, urllib.error.HTTPError) and err.code in (401, 403):
        return {"status": "auth_error", "detail": f"HTTP {err.code}"}
    return {"status": "error", "detail": str(err)[:200]}


# ── xAI ───────────────────────────────────────────────────────────────────────
# api.x.ai is Cloudflare-blocked (ASN 1010) from this machine's residential IP.
# We route through a Lambda proxy instead: Mac Mini → Lambda (AWS IP) → api.x.ai.
# xAI has no balance API, so we track last-known balance manually.
# Update XAI_LAST_KNOWN_BALANCE and XAI_LAST_CHECKED when Mark reports a new figure.
XAI_LAST_KNOWN_BALANCE = 235.75   # USD — last reported by Mark 2026-02-22
XAI_LAST_CHECKED       = "2026-02-22"
LAMBDA_PROXY_URL       = "https://z01mzuzo05.execute-api.us-east-1.amazonaws.com/prod/proxy/xai"
PROXY_SECRET           = _env.get("PROXY_SECRET", "")

def check_xai() -> dict:
    if not XAI_KEY:
        return {"status": "no_key"}

    if not PROXY_SECRET:
        return {
            "status": "config_error",
            "note": "PROXY_SECRET not set in .env.local",
        }

    # Route through Lambda proxy — bypasses Cloudflare ASN block
    payload = {
        "model": "grok-3-fast",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }
    data_bytes = json.dumps(payload).encode()
    req = urllib.request.Request(
        LAMBDA_PROXY_URL,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "X-Proxy-Secret": PROXY_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {
                "status": "ok",
                "balance_usd": f"~${XAI_LAST_KNOWN_BALANCE} (as of {XAI_LAST_CHECKED} — no API, check console.x.ai)",
                "source": "lambda_proxy_test_call",
            }
    except urllib.error.HTTPError as e:
        if _is_quota_err(e):
            return {"status": "exhausted", "note": "credits exhausted"}
        if e.code in (401, 403):
            return {"status": "auth_error", "detail": f"Proxy or xAI key rejected (HTTP {e.code})"}
        return {"status": "error", "detail": f"HTTP {e.code}"}
    except Exception as ex:
        return {"status": "error", "detail": str(ex)[:200]}


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    results = {
        "openai":    check_openai(),
        "anthropic": check_anthropic(),
        "xai":       check_xai(),
    }

    # At least one usable? (blocked ≠ exhausted — xAI is blocked at network level,
    # not out of credits, so don't count it against usability)
    usable = [p for p, r in results.items() if r.get("status") == "ok"]
    results["_summary"] = {
        "usable_providers": usable,
        "all_exhausted": len(usable) == 0,
        "recommended": usable[0] if usable else None,
    }

    print(json.dumps(results, indent=2))
    sys.exit(0 if usable else 1)


if __name__ == "__main__":
    main()
