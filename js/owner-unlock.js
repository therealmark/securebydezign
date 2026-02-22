/**
 * Owner bypass — site owner only.
 * First visit: load any article with ?owner=sbdz-mk26 to activate.
 * Device remembers via localStorage. Shows a floating Unlock button → direct PDF.
 * To reset: localStorage.removeItem('sbdz_owner') in browser console.
 */
(function () {
  var TOKEN = 'sbdz-mk26';
  var LS_KEY = 'sbdz_owner';

  // Activate on first visit with ?owner=TOKEN
  var params = new URLSearchParams(window.location.search);
  if (params.get('owner') === TOKEN) {
    localStorage.setItem(LS_KEY, '1');
  }

  if (localStorage.getItem(LS_KEY) !== '1') return;

  // Map URL slug → PDF path (absolute from site root)
  var PDF_MAP = {
    'supply-chain-ai':    '/pdfs/supply-chain-ai.pdf',
    'llm-red-teaming':    '/pdfs/llm-red-teaming.pdf',
    'api-security':       '/pdfs/api-security.pdf',
    'data-poisoning':     '/pdfs/data-poisoning.pdf',
    'model-inversion':    '/pdfs/model-inversion.pdf',
    'prompt-injection':   '/pdfs/pinjection.pdf',
    'agentic-ai-security':'/pdfs/agentic-ai-security.pdf',
  };

  var path = window.location.pathname;
  var slug = null;
  var keys = Object.keys(PDF_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (path.indexOf(keys[i]) !== -1) { slug = keys[i]; break; }
  }
  if (!slug) return;

  var pdfHref = PDF_MAP[slug];

  function injectButton() {
    if (document.getElementById('owner-unlock-btn')) return;

    var btn = document.createElement('a');
    btn.id = 'owner-unlock-btn';
    btn.href = pdfHref;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.setAttribute('aria-label', 'Owner: open PDF directly');
    btn.innerHTML =
      '<span style="font-size:18px">🔓</span>' +
      '<span style="font-size:13px;font-weight:700;letter-spacing:.02em">Unlock PDF</span>';
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:20px',
      'z-index:99999',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'background:#059669',
      'color:#fff',
      'padding:12px 20px',
      'border-radius:14px',
      'text-decoration:none',
      'box-shadow:0 4px 24px rgba(0,0,0,.45)',
      'font-family:system-ui,-apple-system,sans-serif',
      '-webkit-tap-highlight-color:transparent',
      'transition:opacity .15s',
    ].join(';');

    // Subtle tap feedback on mobile
    btn.addEventListener('touchstart', function () { btn.style.opacity = '.75'; }, { passive: true });
    btn.addEventListener('touchend',   function () { btn.style.opacity = '1'; },   { passive: true });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
