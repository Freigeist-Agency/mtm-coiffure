/* Intro paragraph: the words pop up one by one, driven by scroll (index.html .intro-text).
   The HTML stays a plain sentence; this script splits it into inline-block words at runtime and gives every word (and portrait)
   its own scrubbed scroll window, so scrolling back up reverses it. Rules for a window:
   - it opens when the word itself is inside the viewport (its top a small margin above the bottom edge), never earlier;
   - it closes when the paragraph's centre reaches the viewport's centre, so every word is in by then;
   - on a paragraph taller than the viewport a word may still be below the fold at that point: it then closes when the word has
     scrolled fully into view (the off-screen rule wins over the centre rule).
   Window positions are measured on load / refresh and cached; nothing is measured while scrolling.
   Nothing happens (text stays plain and fully visible) without GSAP/ScrollTrigger or under prefers-reduced-motion. */
(function () {
  'use strict';

  /* ---- motion values: the only place to tune the effect ---- */
  var WORD_FROM_Y = '0.6em';           // words start this far below their line
  var WORD_FROM_OPACITY = 0;
  var PORTRAIT_FROM_SCALE = 0.6;       // the three round portraits grow from this scale
  var PORTRAIT_FROM_OPACITY = 0;
  var EASE = 'back.out(1.7)';          // the pop (overshoot), applied over each word's own scroll window
  var ENTER_MARGIN_VH = 0.03;          // a word's reveal starts when its (shifted) top is this far above the bottom edge, in viewport heights
  var DONE_AT_VH = 0.5;                // every word is in when the paragraph centre is at this height of the viewport (0.5 = centre)
  var WORD_STAGGER_VH = 0.012;         // extra scroll distance between neighbours on one line (reading order), in viewport heights
  var MIN_SPAN_VH = 0.03;              // no window is shorter than this, in viewport heights

  var text = document.querySelector('.intro-text');
  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!text || text.__wordReveal || !gsap || !ScrollTrigger) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  text.__wordReveal = true;
  gsap.registerPlugin(ScrollTrigger);

  /* One screen-reader copy, so the sentence is read once and normally; the split words are hidden from assistive tech. */
  var plain = text.textContent.replace(/\s+/g, ' ').trim();
  var sr = document.createElement('p');
  sr.className = 'wr-sr';
  sr.textContent = plain;
  text.parentNode.insertBefore(sr, text);
  text.setAttribute('aria-hidden', 'true');

  /* Split every text node into inline-block words; whitespace stays as real text nodes. A word also ends after a hyphen
     ("Familienfriseur-" + "betrieb"), because the browser may break the line there and a single inline-block would not.
     `steps` is the reading order, one entry per word piece or portrait. */
  var steps = [];
  function split(node) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 3) {
        var parts = n.nodeValue.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var pieces = part.match(/[^-]+-?|-/g);
          pieces.forEach(function (piece) {
            var w = document.createElement('span');
            w.className = 'wr-word';
            w.textContent = piece;
            frag.appendChild(w);
            steps.push({ els: [w], pic: false });   // own window: the pieces can sit on different lines
          });
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1) {
        if (n.tagName === 'IMG') steps.push({ els: [n], pic: true });
        else if (n.tagName !== 'BR') split(n);
      }
    });
  }
  split(text);

  var items = [];   // { els, pic, line, win: [start, end] }
  steps.forEach(function (st) { items.push({ els: st.els, pic: st.pic, win: [0, 0] }); });

  /* Document position of an element from the offsetTop chain: unlike getBoundingClientRect it ignores the transform being animated. */
  function docTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }

  function measure() {
    var H = window.innerHeight, fs = parseFloat(getComputedStyle(text).fontSize) || 16;
    var off = 0.6 * fs;   // WORD_FROM_Y in px (em of the paragraph); the word's start is measured from where its shifted top is
    var pc = docTop(text) + text.offsetHeight / 2;
    var sEnd = pc - H * DONE_AT_VH;
    var margin = ENTER_MARGIN_VH * H, minSpan = MIN_SPAN_VH * H, stagger = WORD_STAGGER_VH * H;
    var lineMid = null, rank = 0;
    items.forEach(function (it) {
      var el = it.els[0];
      var y = docTop(el), h = el.offsetHeight, mid = y + h / 2;
      if (lineMid === null || Math.abs(mid - lineMid) > 0.4 * fs) { lineMid = mid; rank = 0; } else { rank++; }
      var start = y + (it.pic ? 0 : off) - H + margin + rank * stagger;
      var end = Math.max(sEnd, y + h - H, start + minSpan);
      it.win = [start, end];
    });
  }
  var dirty = true;
  function win(i) { if (dirty) { measure(); dirty = false; } return items[i].win; }
  ScrollTrigger.addEventListener('refreshInit', function () { dirty = true; });

  items.forEach(function (it, i) {
    var from = it.pic
      ? { scale: PORTRAIT_FROM_SCALE, opacity: PORTRAIT_FROM_OPACITY }
      : { y: WORD_FROM_Y, opacity: WORD_FROM_OPACITY };
    var to = it.pic ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 };
    to.ease = EASE; to.duration = 1;
    gsap.fromTo(it.els, from, Object.assign(to, {
      scrollTrigger: { start: function () { return win(i)[0]; }, end: function () { return win(i)[1]; }, id: 'word-reveal-' + i, scrub: true, invalidateOnRefresh: true }
    }));
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
