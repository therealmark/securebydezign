/**
 * article-refs.js — Reference term popover positioning
 * Adjusts popover position so it never clips outside the viewport.
 */
(function () {
  'use strict';

  function positionPopover(term) {
    const popover = term.querySelector('.ref-popover');
    if (!popover) return;

    // Reset to default centered position
    popover.style.left    = '50%';
    popover.style.right   = 'auto';
    popover.style.transform = 'translateX(-50%)';

    // Make it visible briefly to measure its rect
    popover.style.display = 'block';
    const rect = popover.getBoundingClientRect();
    popover.style.display = '';

    const margin = 16;
    if (rect.right > window.innerWidth - margin) {
      // Too far right — anchor to right edge of term
      popover.style.left      = 'auto';
      popover.style.right     = '0';
      popover.style.transform = 'none';
    } else if (rect.left < margin) {
      // Too far left — anchor to left edge of term
      popover.style.left      = '0';
      popover.style.transform = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var terms = document.querySelectorAll('.ref-term');

    terms.forEach(function (term) {
      // Mouse: position on enter
      term.addEventListener('mouseenter', function () {
        positionPopover(term);
      });

      // Touch / keyboard: toggle on click/tap
      term.addEventListener('click', function (e) {
        // Don't intercept clicks on the popover link itself
        if (e.target.classList.contains('ref-popover-link')) return;
        e.stopPropagation();
        const isOpen = term.classList.contains('pop-open');
        // Close all others
        terms.forEach(function (t) { t.classList.remove('pop-open'); });
        if (!isOpen) {
          term.classList.add('pop-open');
          positionPopover(term);
        }
      });

      // Keyboard accessibility
      term.setAttribute('tabindex', '0');
      term.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          term.click();
        }
        if (e.key === 'Escape') {
          term.classList.remove('pop-open');
        }
      });
    });

    // Click anywhere else to close
    document.addEventListener('click', function () {
      terms.forEach(function (t) { t.classList.remove('pop-open'); });
    });
  });
})();
