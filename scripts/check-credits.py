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
def check_xai() -> dict:
    if not XAI_KEY:
        return {"status": "no_key"}

    data, err = _post(
        "https://api.x.ai/v1/chat/completions",
        {"Authorization": f"Bearer {XAI_KEY}"},
        {
            "model": "grok-3-fast",
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


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    results = {
        "openai":    check_openai(),
        "anthropic": check_anthropic(),
        "xai":       check_xai(),
    }

    # At least one usable?
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
