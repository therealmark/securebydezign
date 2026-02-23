/**
 * definitions-widget.js
 * Floating search widget for securebydezign.com articles.
 * Injects a bottom-right button → compact search overlay → full definition detail.
 */
(function () {
  'use strict';

  const API = 'https://z01mzuzo05.execute-api.us-east-1.amazonaws.com/prod/api/search-defs';
  const META_URL = 'https://www.securebydezign.com/data/definitions-meta.json';
  const DEFS_PAGE = 'https://www.securebydezign.com/definitions.html';

  let allDefs = [];
  let searchTimer = null;
  let widgetOpen = false;
  let _detailTrigger = null; // element that opened the detail overlay

  // ── Category colours (matches definitions.html) ──────────────────────────
  const CAT_COLORS = {
    'OWASP':               'bg-orange-900/60 text-orange-300 border-orange-500/30',
    'MITRE ATLAS':         'bg-red-900/60 text-red-300 border-red-500/30',
    'MITRE ATT&CK':        'bg-rose-900/60 text-rose-300 border-rose-500/30',
    'Privacy Attack':      'bg-purple-900/60 text-purple-300 border-purple-500/30',
    'Privacy Defense':     'bg-violet-900/60 text-violet-300 border-violet-500/30',
    'LLM Attack':          'bg-yellow-900/60 text-yellow-300 border-yellow-500/30',
    'Agentic Attack':      'bg-amber-900/60 text-amber-300 border-amber-500/30',
    'Supply Chain':        'bg-blue-900/60 text-blue-300 border-blue-500/30',
    'Supply Chain Defense':'bg-sky-900/60 text-sky-300 border-sky-500/30',
    'Defense Tool':        'bg-emerald-900/60 text-emerald-300 border-emerald-500/30',
    'Framework':           'bg-teal-900/60 text-teal-300 border-teal-500/30',
    'Availability Attack': 'bg-pink-900/60 text-pink-300 border-pink-500/30',
    'ML Attack':           'bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-500/30',
    'Distributed ML':      'bg-indigo-900/60 text-indigo-300 border-indigo-500/30',
    'Agentic Security':    'bg-amber-900/60 text-amber-300 border-amber-500/30',
    'RAG Attack':          'bg-lime-900/60 text-lime-300 border-lime-500/30',
    'LLM Concept':         'bg-zinc-800 text-zinc-300 border-zinc-600',
    'AI Protocol':         'bg-cyan-900/60 text-cyan-300 border-cyan-500/30',
    'IP Protection':       'bg-green-900/60 text-green-300 border-green-500/30',
    'CWE':                 'bg-red-900/60 text-red-300 border-red-500/40',
  };

  function catCls(cat) {
    return CAT_COLORS[cat] || 'bg-zinc-800 text-zinc-300 border-zinc-600';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  function buildWidget() {
    const css = `
      <style id="dw-style">
        #dw-fab { position: fixed; bottom: 28px; right: 28px; z-index: 9990;
          width: 52px; height: 52px; border-radius: 50%;
          background: #059669; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(5,150,105,0.45);
          transition: background 0.15s, transform 0.15s; }
        #dw-fab:hover { background: #10b981; transform: scale(1.07); }
        #dw-fab svg { width: 22px; height: 22px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #dw-panel { position: fixed; bottom: 92px; right: 28px; z-index: 9991;
          width: 380px; max-width: calc(100vw - 40px);
          background: #18181b; border: 1px solid #3f3f46; border-radius: 20px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.6);
          display: none; flex-direction: column; overflow: hidden;
          animation: dw-slide-up 0.18s ease; }
        @keyframes dw-slide-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        #dw-panel.open { display: flex; }
        #dw-search-wrap { padding: 14px 14px 0; position: relative; }
        #dw-input { width: 100%; background: #27272a; border: 1px solid #52525b;
          border-radius: 12px; padding: 10px 38px 10px 14px; font-size: 0.875rem;
          color: #e4e4e7; outline: none; box-sizing: border-box; }
        #dw-input:focus { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.2); }
        #dw-input::placeholder { color: #71717a; }
        #dw-clear { position: absolute; right: 24px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: #71717a; cursor: pointer;
          font-size: 0.85rem; display: none; padding: 4px; }
        #dw-clear:hover { color: #d4d4d8; }
        #dw-results { max-height: 340px; overflow-y: auto; padding: 10px 10px 0; }
        #dw-results::-webkit-scrollbar { width: 4px; }
        #dw-results::-webkit-scrollbar-track { background: transparent; }
        #dw-results::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
        #dw-results[aria-live] { }  /* live region for screen readers */
        .dw-card { padding: 10px 12px; border-radius: 12px; cursor: pointer;
          border: 1px solid #3f3f46; margin-bottom: 7px;
          transition: border-color 0.12s, background 0.12s; background: #27272a; }
        .dw-card:hover { border-color: rgba(16,185,129,0.45); background: #1f1f23; }
        .dw-term { font-size: 0.875rem; font-weight: 600; color: #f4f4f5; margin-bottom: 4px; }
        .dw-short { font-size: 0.78rem; color: #a1a1aa; line-height: 1.45; }
        .dw-badge { display: inline-block; padding: 1px 7px; border-radius: 9999px;
          font-size: 0.66rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; border-width: 1px; border-style: solid;
          margin-bottom: 5px; }
        .dw-score { height: 2px; border-radius: 1px; background: linear-gradient(90deg,#10b981,#059669); margin-top: 6px; }
        #dw-empty { padding: 28px 12px; text-align: center; color: #71717a; font-size: 0.82rem; }
        #dw-spinner { text-align: center; padding: 20px; color: #10b981; }
        @keyframes dw-spin { to { transform: rotate(360deg); } }
        .dw-spin-icon { display: inline-block; animation: dw-spin 0.7s linear infinite; font-size: 1.2rem; }
        #dw-footer { padding: 10px 14px 14px; border-top: 1px solid #27272a;
          display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
        #dw-footer a { font-size: 0.78rem; color: #10b981; text-decoration: none; }
        #dw-footer a:hover { text-decoration: underline; }
        #dw-footer span { font-size: 0.72rem; color: #52525b; }
        /* Detail overlay */
        #dw-detail { position: fixed; inset: 0; z-index: 9995;
          background: rgba(9,9,11,0.88); backdrop-filter: blur(4px);
          display: none; align-items: center; justify-content: center; padding: 20px; }
        #dw-detail.open { display: flex; animation: dw-slide-up 0.18s ease; }
        #dw-detail-box { background: #18181b; border: 1px solid #3f3f46; border-radius: 20px;
          max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 28px;
          position: relative; }
        #dw-detail-box::-webkit-scrollbar { width: 4px; }
        #dw-detail-box::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
        #dw-detail-close { position: absolute; top: 16px; right: 18px;
          background: none; border: none; color: #71717a; font-size: 1.1rem;
          cursor: pointer; padding: 4px; line-height: 1; }
        #dw-detail-close:hover { color: #f4f4f5; }
        #dw-detail-content h2 { font-size: 1.25rem; font-weight: 700; color: #f4f4f5; margin: 8px 0 4px; }
        #dw-detail-content p { font-size: 0.875rem; color: #a1a1aa; line-height: 1.6; margin: 0 0 10px; }
        #dw-detail-content .dw-def-full { color: #d4d4d8; }
        #dw-detail-content .dw-src { color: #10b981; font-size: 0.8rem; font-weight: 500; margin-bottom: 14px; }
        #dw-detail-content .dw-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
        #dw-detail-content .dw-tag { background: #27272a; color: #a1a1aa; border-radius: 9999px;
          padding: 2px 9px; font-size: 0.7rem; }
        #dw-detail-content .dw-ext-btn { display: inline-flex; align-items: center; gap: 6px;
          background: #059669; color: white; border-radius: 10px; padding: 8px 16px;
          font-size: 0.82rem; font-weight: 600; text-decoration: none; margin-top: 14px;
          transition: background 0.12s; }
        #dw-detail-content .dw-ext-btn:hover { background: #10b981; }
        @media (max-width: 440px) {
          #dw-panel { width: calc(100vw - 20px); right: 10px; bottom: 80px; }
          #dw-fab { right: 14px; bottom: 18px; }
        }
      </style>`;

    const fabIcon = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;

    const html = `
      ${css}
      <!-- FAB -->
      <button id="dw-fab" title="Search definitions" aria-label="Search AI/ML security definitions"
              aria-expanded="false" aria-controls="dw-panel">
        ${fabIcon}
      </button>
      <!-- Search panel -->
      <div id="dw-panel" role="dialog" aria-label="Definitions search" aria-modal="true">
        <div id="dw-search-wrap">
          <input id="dw-input" type="text" placeholder='Try "jailbreak", "data poisoning"…'
            autocomplete="off" spellcheck="false" aria-label="Search definitions"
            aria-controls="dw-results" aria-autocomplete="list"/>
          <button id="dw-clear" aria-label="Clear search">✕</button>
        </div>
        <div id="dw-results" aria-live="polite" aria-atomic="false"></div>
        <div id="dw-footer">
          <span id="dw-count"></span>
          <a href="${DEFS_PAGE}" target="_blank" rel="noopener">View all definitions →</a>
        </div>
      </div>
      <!-- Full detail overlay -->
      <div id="dw-detail" role="dialog" aria-modal="true">
        <div id="dw-detail-box">
          <button id="dw-detail-close" aria-label="Close">✕</button>
          <div id="dw-detail-content"></div>
        </div>
      </div>`;

    const container = document.createElement('div');
    container.id = 'dw-root';
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderCard(d, score) {
    const cls = catCls(d.category);
    const pct = score !== undefined ? Math.round(score * 100) : null;
    const bar = pct ? `<div class="dw-score" style="width:${pct}%"></div>` : '';
    return `<div class="dw-card" data-id="${esc(d.id)}" role="button" tabindex="0"
      aria-label="View definition: ${esc(d.term)}">
      <div class="dw-badge ${cls}">${esc(d.category)}</div>
      <div class="dw-term">${esc(d.term)}</div>
      <div class="dw-short">${esc(d.short)}</div>
      ${bar}
    </div>`;
  }

  function renderDetail(d) {
    const cls = catCls(d.category);
    const tags = (d.tags || []).map(t => `<span class="dw-tag">${esc(t)}</span>`).join('');
    return `
      <div class="dw-badge ${cls}" style="margin-bottom:8px">${esc(d.category)}</div>
      <h2>${esc(d.term)}</h2>
      <div class="dw-src">${esc(d.source)}</div>
      <p style="background:#27272a;padding:12px;border-radius:10px;color:#f4f4f5;margin-bottom:12px">${esc(d.short)}</p>
      <p class="dw-def-full">${esc(d.definition)}</p>
      ${tags ? `<div class="dw-tags">${tags}</div>` : ''}
      <a class="dw-ext-btn" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">
        ↗ Official source
      </a>`;
  }

  // ── Wire events ───────────────────────────────────────────────────────────
  function showEmpty(msg) {
    document.getElementById('dw-results').innerHTML =
      `<div id="dw-empty">${msg}</div>`;
  }

  function showSpinner() {
    document.getElementById('dw-results').innerHTML =
      `<div id="dw-spinner"><span class="dw-spin-icon">⟳</span></div>`;
  }

  function attachCardClicks() {
    document.querySelectorAll('#dw-results .dw-card').forEach(el => {
      el.addEventListener('click', () => {
        _detailTrigger = el;
        openDetail(el.dataset.id);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _detailTrigger = el;
          openDetail(el.dataset.id);
        }
      });
    });
  }

  function openDetail(id) {
    const d = allDefs.find(x => x.id === id);
    if (!d) return;
    document.getElementById('dw-detail-content').innerHTML = renderDetail(d);
    const overlay = document.getElementById('dw-detail');
    overlay.setAttribute('aria-label', d.term);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Move focus to close button
    requestAnimationFrame(() => {
      const closeBtn = document.getElementById('dw-detail-close');
      if (closeBtn) closeBtn.focus();
    });
  }

  function closeDetail() {
    document.getElementById('dw-detail').classList.remove('open');
    document.body.style.overflow = '';
    // Return focus to the card that triggered the detail, or the panel input
    if (_detailTrigger) {
      _detailTrigger.focus();
      _detailTrigger = null;
    } else {
      const input = document.getElementById('dw-input');
      if (input) input.focus();
    }
  }

  function togglePanel() {
    const panel = document.getElementById('dw-panel');
    const fab   = document.getElementById('dw-fab');
    widgetOpen = !widgetOpen;
    fab.setAttribute('aria-expanded', String(widgetOpen));
    if (widgetOpen) {
      panel.classList.add('open');
      document.getElementById('dw-input').focus();
      if (allDefs.length && !document.querySelector('#dw-results .dw-card')) {
        renderBrowseTop();
      }
    } else {
      panel.classList.remove('open');
      fab.focus(); // return focus to trigger
    }
  }

  function renderBrowseTop() {
    const sample = allDefs.slice(0, 6);
    document.getElementById('dw-results').innerHTML = sample.map(d => renderCard(d)).join('');
    document.getElementById('dw-count').textContent = `${allDefs.length} definitions`;
    attachCardClicks();
  }

  async function doSearch(q) {
    showSpinner();
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, { credentials: 'omit' });
      const data = await res.json();
      const results = data.results || [];
      if (!results.length) {
        showEmpty('No matches. Try a broader term.');
        document.getElementById('dw-count').textContent = '';
        return;
      }
      document.getElementById('dw-results').innerHTML = results.map(d => renderCard(d, d.score)).join('');
      document.getElementById('dw-count').textContent = `${results.length} of ${data.total || allDefs.length}`;
      attachCardClicks();
    } catch {
      // Fallback: client-side substring match
      const ql = q.toLowerCase();
      const hits = allDefs
        .filter(d => [d.term, d.short, ...(d.tags || [])].join(' ').toLowerCase().includes(ql))
        .slice(0, 8);
      if (!hits.length) {
        showEmpty('No matches. Try a broader term.');
      } else {
        document.getElementById('dw-results').innerHTML = hits.map(d => renderCard(d)).join('');
        attachCardClicks();
      }
      document.getElementById('dw-count').textContent = hits.length ? `${hits.length} found` : '';
    }
  }

  function clearSearch() {
    const input = document.getElementById('dw-input');
    input.value = '';
    document.getElementById('dw-clear').style.display = 'none';
    renderBrowseTop();
  }

  // ── Load metadata ─────────────────────────────────────────────────────────
  async function loadMeta() {
    try {
      const res = await fetch(META_URL);
      allDefs = await res.json();
    } catch (e) {
      console.warn('[definitions-widget] failed to load meta', e);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    buildWidget();
    loadMeta();

    document.getElementById('dw-fab').addEventListener('click', togglePanel);

    document.getElementById('dw-input').addEventListener('input', e => {
      const q = e.target.value.trim();
      const clearBtn = document.getElementById('dw-clear');
      clearBtn.style.display = q ? 'block' : 'none';
      clearTimeout(searchTimer);
      if (!q) { renderBrowseTop(); return; }
      if (q.length < 2) return;
      searchTimer = setTimeout(() => doSearch(q), 380);
    });

    document.getElementById('dw-clear').addEventListener('click', clearSearch);

    document.getElementById('dw-detail-close').addEventListener('click', closeDetail);
    document.getElementById('dw-detail').addEventListener('click', e => {
      if (e.target === document.getElementById('dw-detail')) closeDetail();
    });

    // Close panel when clicking outside
    document.addEventListener('click', e => {
      if (!widgetOpen) return;
      const panel = document.getElementById('dw-panel');
      const fab = document.getElementById('dw-fab');
      const detail = document.getElementById('dw-detail');
      if (!panel.contains(e.target) && !fab.contains(e.target) && !detail.contains(e.target)) {
        widgetOpen = false;
        panel.classList.remove('open');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.getElementById('dw-detail').classList.contains('open')) { closeDetail(); return; }
        if (widgetOpen) { widgetOpen = false; document.getElementById('dw-panel').classList.remove('open'); }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
