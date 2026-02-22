/**
 * Per-article Stripe Payment Links.
 * Uses test links on localhost or when URL has ?test=1; otherwise live.
 * Live links are populated after running: STRIPE_KEY=sk_live_... node stripe-setup.mjs live
 */
(function () {
  var TEST = {
    'supply-chain-ai':     'https://buy.stripe.com/test_9B614m68N5imdLc5v0eME02',
    'llm-red-teaming':     'https://buy.stripe.com/test_4gM6oGeFj7qu5eG7D8eME03',
    'api-security':        'https://buy.stripe.com/test_14A3cubt76mqbD40aGeME04',
    'data-poisoning':      'https://buy.stripe.com/test_5kQ9AB2WBfX08qS4qWeME05',
    'model-inversion':     'https://buy.stripe.com/test_bJe00ifJnaCG7mO0aGeME06',
    'prompt-injection':    'https://buy.stripe.com/test_28E7sK68N7quePg5v0eME07',
    'agentic-ai-security': 'https://buy.stripe.com/test_8x27sK9kZh147mOf5AeME08',
  };

  var LIVE = {
    // Populated after running: STRIPE_KEY=sk_live_... node stripe-setup.mjs live
    // e.g. 'supply-chain-ai': 'https://buy.stripe.com/...',
  };

  var useTest = window.location.hostname === 'localhost' ||
                window.location.search.indexOf('test=1') !== -1;

  var path = window.location.pathname;
  var slug = null;
  var keys = Object.keys(TEST);
  for (var i = 0; i < keys.length; i++) {
    if (path.indexOf(keys[i]) !== -1) { slug = keys[i]; break; }
  }

  var url = slug ? (useTest ? TEST[slug] : LIVE[slug]) : null;
  if (!url) return;

  function apply() {
    document.querySelectorAll('a[href*="buy.stripe.com"]').forEach(function (a) {
      a.href = url;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
