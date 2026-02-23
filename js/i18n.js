/**
 * i18n.js — Lightweight internationalization for securebydezign.com
 * Supports data-i18n, data-i18n-html, data-i18n-placeholder, data-i18n-aria-label, data-i18n-title
 */
(function () {
  'use strict';

  const SUPPORTED = ['en', 'es'];
  const DEFAULT   = 'en';

  let currentLang = DEFAULT;
  let strings     = {};

  /* ── Storage helpers ─────────────────────────────────── */
  function stored()       { try { return localStorage.getItem('sbdz-lang') || null; } catch { return null; } }
  function store(code)    { try { localStorage.setItem('sbdz-lang', code); } catch {} }
  function browserLang()  {
    const l = (navigator.language || '').split('-')[0].toLowerCase();
    return SUPPORTED.includes(l) ? l : DEFAULT;
  }

  /* ── Apply translations to the live DOM ─────────────────── */
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = strings[el.dataset.i18n];
      if (v !== undefined) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const v = strings[el.dataset.i18nHtml];
      if (v !== undefined) el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const v = strings[el.dataset.i18nPlaceholder];
      if (v !== undefined) el.placeholder = v;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const v = strings[el.dataset.i18nAriaLabel];
      if (v !== undefined) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const v = strings[el.dataset.i18nTitle];
      if (v !== undefined) el.title = v;
    });

    // Sync switcher UI to current lang
    const sw = document.getElementById('lang-switcher');
    if (sw) sw.value = currentLang;
  }

  /* ── Locale fetcher ──────────────────────────────────────── */
  async function fetchLocale(code) {
    // Resolve path relative to wherever we are in the site
    const base = window.location.pathname.includes('/articles/') ? '../locales/' : '/locales/';
    try {
      const r = await fetch(`${base}${code}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.warn('[i18n] could not load locale', code, e.message);
      return null;
    }
  }

  /* ── Public: switch language ────────────────────────────── */
  async function setLang(code) {
    if (!SUPPORTED.includes(code)) code = DEFAULT;
    const locale = await fetchLocale(code);
    if (!locale) {
      if (code !== DEFAULT) return setLang(DEFAULT); // graceful fallback
      return;
    }
    strings     = locale;
    currentLang = code;
    store(code);
    document.documentElement.lang = code;
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
  }

  /* ── Init ────────────────────────────────────────────────── */
  async function init() {
    const lang = stored() || browserLang();

    // Always start with English as the base layer
    const en = await fetchLocale(DEFAULT);
    if (en) strings = en;

    if (lang !== DEFAULT) {
      const locale = await fetchLocale(lang);
      if (locale) {
        strings     = Object.assign({}, en || {}, locale); // merge, target overwrites base
        currentLang = lang;
        store(lang);
        document.documentElement.lang = lang;
      }
    } else {
      currentLang = DEFAULT;
      document.documentElement.lang = DEFAULT;
    }

    apply();

    // Wire language switcher
    const sw = document.getElementById('lang-switcher');
    if (sw) {
      sw.value = currentLang;
      sw.addEventListener('change', e => setLang(e.target.value));
    }
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.i18n = {
    get lang() { return currentLang; },
    t(key)     { return strings[key] !== undefined ? strings[key] : key; },
    setLang,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
