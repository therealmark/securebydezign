const stripe = Stripe('pk_live_51T3MFdB50TQ4M7eDzNU6jLJcucY4puhhw67IqguzSQlXpcGQiZkCvDYD9VOr1ZmiF7cqMt5NUJKJIo6E5EIgQTKY00xpjIXmEy');

document.addEventListener('DOMContentLoaded', function() {
  const buttons = document.querySelectorAll('#checkout-button-api, #checkout-button-api-full');
  buttons.forEach(button => {
    button.addEventListener('click', async function() {
      const {error} = await stripe.redirectToCheckout({
        lineItems: [{price: 'price_1T3MaiB50TQ4M7eD4geVxBoD', quantity: 1}],
        mode: 'payment',
        successUrl: 'https://www.securebydezign.com/success.html',
        cancelUrl: 'https://www.securebydezign.com/articles/api-security.html',
      });
      if (error) {
        console.error(error);
        alert('Error redirecting to checkout: ' + error.message);
      }
    });
  });
});
