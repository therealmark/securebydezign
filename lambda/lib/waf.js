/**
 * waf.js — Lambda-native WAF middleware
 * OWASP Core Rule Set-inspired rules for the securebydezign.com API.
 *
 * Rules cover: SQLi, XSS, path traversal, command injection, SSRF/SSRF probes,
 * prompt injection (meta for an AI security site), scanner fingerprints,
 * and oversized payloads.
 *
 * Blocked requests are logged as structured JSON to stdout (CloudWatch).
 * Returns a 403 response object; returns null if the request is clean.
 *
 * Usage:
 *   import { wafCheck } from './lib/waf.js';
 *   const blocked = wafCheck(event);
 *   if (blocked) return blocked;
 */

// ── Rule definitions ────────────────────────────────────────────────────────

const RULES = [
  // ── SQL Injection (OWASP CRS 942xxx) ──────────────────────────────────────
  {
    id:       'WAF-942100',
    name:     'SQL Injection — UNION/SELECT keywords',
    severity: 'CRITICAL',
    pattern:  /(\bunion\b.{0,50}\bselect\b|\bselect\b.{0,50}\bfrom\b|\binsert\b.{0,50}\binto\b|\bdelete\b.{0,50}\bfrom\b|\bdrop\b.{0,20}\btable\b|\bdrop\b.{0,20}\bdatabase\b)/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-942200',
    name:     'SQL Injection — comment sequences and stacked queries',
    severity: 'HIGH',
    pattern:  /(--|#\s|\/\*|\*\/|;\s*(select|insert|update|delete|drop|exec))/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-942300',
    name:     'SQL Injection — Boolean-based blind',
    severity: 'MEDIUM',
    pattern:  /(\b(or|and)\b\s+[\d\w'"]+\s*=\s*[\d\w'"]+\s*(--|#|\/\*|$)|\b(or|and)\b\s+\d+\s*[<>=!]+\s*\d+)/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-942400',
    name:     'SQL Injection — common tautologies',
    severity: 'HIGH',
    pattern:  /'\s*(or|and)\s*'?[\d\w]+\s*'?\s*=\s*'?[\d\w]+'?|'\s*or\s*1\s*=\s*1/i,
    targets:  ['query', 'body'],
  },

  // ── Cross-Site Scripting (OWASP CRS 941xxx) ───────────────────────────────
  {
    id:       'WAF-941100',
    name:     'XSS — script tag injection',
    severity: 'HIGH',
    pattern:  /<\s*script[\s>\/]|<\/\s*script\s*>/i,
    targets:  ['query', 'body', 'headers'],
  },
  {
    id:       'WAF-941110',
    name:     'XSS — event handler injection',
    severity: 'HIGH',
    pattern:  /\bon\w+\s*=\s*["']?[^"'\s>]+|javascript\s*:/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-941120',
    name:     'XSS — iframe/object/embed injection',
    severity: 'HIGH',
    pattern:  /<\s*(iframe|object|embed|applet|form|base|link|meta)\b/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-941130',
    name:     'XSS — expression/eval injection',
    severity: 'MEDIUM',
    pattern:  /(expression\s*\(|eval\s*\(|document\.(cookie|write|location)|window\.(location|open)|alert\s*\()/i,
    targets:  ['query', 'body'],
  },

  // ── Path Traversal (OWASP CRS 930xxx) ────────────────────────────────────
  {
    id:       'WAF-930100',
    name:     'Path Traversal — dot-dot sequences',
    severity: 'HIGH',
    pattern:  /(\.\.[\/\\]|%2e%2e[%\/\\]|%252e%252e|\.\.%2f|\.\.%5c)/i,
    targets:  ['path', 'query'],
  },
  {
    id:       'WAF-930110',
    name:     'Path Traversal — absolute path access',
    severity: 'MEDIUM',
    pattern:  /(\/etc\/passwd|\/etc\/shadow|\/proc\/|\/sys\/|\/windows\/system|c:\\windows|c:\\program)/i,
    targets:  ['path', 'query', 'body'],
  },

  // ── Command Injection (OWASP CRS 932xxx) ──────────────────────────────────
  {
    id:       'WAF-932100',
    name:     'Command Injection — shell metacharacters + commands',
    severity: 'CRITICAL',
    pattern:  /(\|\||&&|;\s*(ls|cat|wget|curl|chmod|chown|rm|mv|cp|nc|bash|sh|python|perl|php|ruby|node)|`[^`]*`|\$\([^)]*\))/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-932110',
    name:     'Command Injection — Windows cmd',
    severity: 'HIGH',
    pattern:  /(cmd\.exe|powershell|net\s+user|net\s+localgroup|whoami|systeminfo|ipconfig|netstat)/i,
    targets:  ['query', 'body'],
  },

  // ── SSRF / Cloud Metadata Probes ─────────────────────────────────────────
  {
    id:       'WAF-934100',
    name:     'SSRF — cloud metadata endpoint probe',
    severity: 'CRITICAL',
    pattern:  /(169\.254\.169\.254|fd00:ec2:|metadata\.google\.internal|169\.254\.170\.2)/i,
    targets:  ['query', 'body'],
  },
  {
    id:       'WAF-934110',
    name:     'SSRF — internal network targeting',
    severity: 'HIGH',
    pattern:  /(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)/i,
    targets:  ['query', 'body'],
  },

  // ── Prompt Injection (novel, relevant to this site) ───────────────────────
  {
    id:       'WAF-960100',
    name:     'Prompt Injection — instruction override patterns',
    severity: 'MEDIUM',
    pattern:  /(ignore\s+(all\s+)?(previous|prior|above)\s+instructions?|disregard\s+(your|the|all)\s+(previous|prior|system)|forget\s+(everything|all|your)\s+(you('ve)?\s+)?learned|you\s+are\s+now\s+DAN|act\s+as\s+(if\s+you\s+have\s+no|an?\s+unfiltered)|jailbreak|prompt\s+injection)/i,
    targets:  ['query', 'body'],
  },

  // ── Scanner / Exploit Tool Fingerprints ───────────────────────────────────
  {
    id:       'WAF-913100',
    name:     'Scanner — known attack tool user agents',
    severity: 'MEDIUM',
    pattern:  /(sqlmap|nikto|nessus|openvas|masscan|nuclei|acunetix|netsparker|dirbuster|gobuster|ffuf|wfuzz|hydra|medusa|metasploit|burpsuite|havij|zaproxy|w3af|skipfish|wpscan|joomscan)/i,
    targets:  ['useragent'],
  },
  {
    id:       'WAF-913110',
    name:     'Scanner — common path probe signatures',
    severity: 'LOW',
    pattern:  /(wp-login|wp-admin|wp-config|phpmyadmin|\.env|\.git\/config|\.htaccess|admin\.php|shell\.php|eval\.php|xmlrpc\.php|cgi-bin|config\.xml|web\.config|appsettings\.json|\.aws\/credentials)/i,
    targets:  ['path'],
  },
  {
    id:       'WAF-913120',
    name:     'Scanner — LFI/RFI probe patterns',
    severity: 'HIGH',
    pattern:  /(php:\/\/filter|php:\/\/input|expect:\/\/|data:\/\/|zip:\/\/|phar:\/\/|file:\/\/|=http:\/\/|=https:\/\/.*\.(php|pl|py|sh|asp|aspx))/i,
    targets:  ['query', 'body'],
  },

  // ── Oversized Payloads ────────────────────────────────────────────────────
  // Handled separately below (size check)
];

// ── Targets the WAF inspects ────────────────────────────────────────────────

function extractTargets(event) {
  const rawQuery = event.queryStringParameters ?? {};
  const queryStr = Object.entries(rawQuery).map(([k, v]) => `${k}=${v}`).join('&');

  let bodyStr = '';
  try {
    if (event.body) {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : (typeof event.body === 'string' ? event.body : JSON.stringify(event.body));
      bodyStr = raw.slice(0, 8192); // cap body inspection at 8KB
    }
  } catch { /* ignore decode errors */ }

  const headers   = event.headers ?? {};
  const userAgent = headers['user-agent'] ?? headers['User-Agent'] ?? '';
  const referer   = headers['referer'] ?? headers['Referer'] ?? '';
  const path      = event.path ?? event.rawPath ?? '';

  return { query: queryStr, body: bodyStr, path, useragent: userAgent, headers: referer };
}

// ── Logging ─────────────────────────────────────────────────────────────────

function logBlock(rule, event, extracted) {
  const record = {
    waf:       true,
    action:    'BLOCK',
    ruleId:    rule.id,
    ruleName:  rule.name,
    severity:  rule.severity,
    method:    event.httpMethod ?? event.requestContext?.http?.method ?? 'UNKNOWN',
    path:      extracted.path,
    query:     extracted.query?.slice(0, 512),
    ip:        event.requestContext?.identity?.sourceIp
                 ?? event.requestContext?.http?.sourceIp
                 ?? 'unknown',
    ua:        extracted.useragent?.slice(0, 256),
    ts:        new Date().toISOString(),
  };
  // Single-line JSON so CloudWatch Logs Insights can parse it easily
  console.log(JSON.stringify(record));
  return record;
}

// ── Main WAF check ───────────────────────────────────────────────────────────

export function wafCheck(event) {
  const extracted = extractTargets(event);

  // 1. Oversized body (> 512KB is suspicious for our API)
  if (extracted.body.length > 524288) {
    const record = {
      waf: true, action: 'BLOCK',
      ruleId: 'WAF-920100', ruleName: 'Oversized request body', severity: 'HIGH',
      method: event.httpMethod ?? 'UNKNOWN',
      path:   extracted.path,
      ip:     event.requestContext?.identity?.sourceIp ?? event.requestContext?.http?.sourceIp ?? 'unknown',
      ts:     new Date().toISOString(),
    };
    console.log(JSON.stringify(record));
    return forbidden('WAF-920100', 'Request blocked: oversized body');
  }

  // 2. Run all pattern rules
  for (const rule of RULES) {
    for (const target of rule.targets) {
      const value = extracted[target];
      if (value && rule.pattern.test(value)) {
        const record = logBlock(rule, event, extracted);
        return forbidden(rule.id, `Request blocked by ${record.ruleId}: ${rule.name}`);
      }
    }
  }

  return null; // clean
}

function forbidden(ruleId, message) {
  return {
    statusCode: 403,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-WAF-Block':                 ruleId,
    },
    body: JSON.stringify({ error: 'Forbidden', code: ruleId }),
  };
}
