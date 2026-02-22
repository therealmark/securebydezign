/**
 * Checkout for API Security article.
 * Uses test Payment Link when ?test=1 or on localhost; otherwise live Stripe Checkout.
 */
(function () {
  var TEST_URL = 'https://buy.stripe.com/test_dRmaEW40F26aaz0g9EeME01';
  var LIVE_KEY = 'pk_live_51T3MFdB50TQ4M7eDzNU6jLJcucY4puhhw67IqguzSQlXpcGQiZkCvDYD9VOr1ZmiF7cqMt5NUJKJIo6E5EIgQTKY00xpjIXmEy';
  var LIVE_PRICE = 'price_1T3MaiB50TQ4M7eD4geVxBoD';
  var CANCEL_URL = 'https://www.securebydezign.com/articles/api-security.html';
  var SUCCESS_URL = 'https://www.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}';

  var useTest = window.location.hostname === 'localhost' || window.location.search.indexOf('test=1') !== -1;

  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('#checkout-button-api, #checkout-button-api-full');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (useTest) {
          window.location.href = TEST_URL;
          return;
        }
        var stripe = Stripe(LIVE_KEY);
        stripe.redirectToCheckout({
          lineItems: [{ price: LIVE_PRICE, quantity: 1 }],
          mode: 'payment',
          successUrl: SUCCESS_URL,
          cancelUrl: CANCEL_URL,
        }).then(function (result) {
          if (result.error) {
            console.error(result.error);
            alert('Error redirecting to checkout: ' + result.error.message);
          }
        });
      });
    });
  });
})();
