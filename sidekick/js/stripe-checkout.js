(() => {
  // TODO: replace the test link once a Stripe test key is available.
  const PAYMENT_LINKS = {
    test: 'https://buy.stripe.com/cNi3cugDw9LOevmbuNb7y09',
    live: 'https://buy.stripe.com/cNi3cugDw9LOevmbuNb7y09'
  };

  const params = new URLSearchParams(window.location.search);
  let mode = window.location.hostname === 'localhost' || params.get('test') === '1' ? 'test' : 'live';

  document.querySelectorAll('[data-checkout="sidekick-kit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = PAYMENT_LINKS[mode];
      if (!url || url.includes('dummy')) {
        alert('Payment link not configured yet.');
        return;
      }
      window.location.href = url;
    });
  });
})();
