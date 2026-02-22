/**
 * Buy Full Guide buttons: use test Stripe on localhost or when URL has ?test=1; otherwise live.
 */
(function() {
  var LIVE = 'https://buy.stripe.com/aFadR8gDw2jm4UM6atb7y00';
  var TEST = 'https://buy.stripe.com/test_dRmaEW40F26aaz0g9EeME01';

  var useTest = window.location.hostname === 'localhost' || window.location.search.indexOf('test=1') !== -1;
  var url = useTest ? TEST : LIVE;

  function apply() {
    document.querySelectorAll('a[href*="buy.stripe.com"]').forEach(function(a) {
      a.href = url;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
