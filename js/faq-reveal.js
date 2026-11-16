/* FAQ answers (cofounder, 2026-11-15): when a question is opened, its answer comes in line by line with the same motion as the
   scroll reveal (js/word-reveal.js): each line rises from 0.6em below and fades in with the same pop, back.out(1.7). The answers sit
   in closed rows, so this one plays on opening, not on scroll: the top line first, the next LINE_GAP seconds later.
   The answer is split into inline-block words once; the lines are read when the row opens (a closed row has no layout), so a
   different line break on a phone is still revealed line by line. One plain screen-reader copy of the answer sits next to it, and the
   split text is hidden from screen readers. The row that is open when the page loads shows its answer as it is (no motion on load).
   Nothing happens without GSAP or under prefers-reduced-motion: the answers simply show. */
(function () {
  'use strict';
  var LINE_FROM_Y = '0.6em', EASE = 'back.out(1.7)';   // the same values as js/word-reveal.js
  var LINE_DURATION = 0.6, LINE_GAP = 0.08;            // seconds

  function init() {
    var gsap = window.gsap;
    if (!gsap) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    Array.prototype.forEach.call(document.querySelectorAll('.faq__item'), function (item) {
      var a = item.querySelector('.faq__a');
      if (!a || a.__faqReveal) return;
      a.__faqReveal = true;

      var sr = document.createElement('p');
      sr.className = 'wr-sr';
      sr.textContent = a.textContent.replace(/\s+/g, ' ').trim();
      a.parentNode.insertBefore(sr, a);
      a.setAttribute('aria-hidden', 'true');

      var words = [];
      Array.prototype.slice.call(a.childNodes).forEach(function (n) {
        if (n.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        n.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement('span');
          w.className = 'wr-word';
          w.textContent = part;
          frag.appendChild(w);
          words.push(w);
        });
        a.replaceChild(frag, n);
      });

      var tl = null;
      item.addEventListener('toggle', function () {
        if (tl) { tl.kill(); tl = null; }
        if (!item.open) { gsap.set(words, { clearProps: 'transform,opacity' }); return; }
        var lines = [], top = null;   // read once, now that the row is open
        words.forEach(function (w) {
          var t = w.offsetTop;
          if (top === null || Math.abs(t - top) > 4) { lines.push([]); top = t; }
          lines[lines.length - 1].push(w);
        });
        tl = gsap.timeline();
        lines.forEach(function (ln, i) {
          tl.fromTo(ln, { y: LINE_FROM_Y, opacity: 0 }, { y: 0, opacity: 1, duration: LINE_DURATION, ease: EASE }, i * LINE_GAP);
        });
        a.setAttribute('data-faq-lines', lines.length);   // for the tests
      });
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
