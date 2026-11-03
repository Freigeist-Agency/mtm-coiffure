/* Intro paragraph: the words pop up one by one, driven by scroll (index.html .intro-text).
   The HTML stays a plain sentence; this script splits it into inline-block words at runtime and gives every word (and portrait)
   its own scrubbed scroll window, so scrolling back up reverses it. Rules for a window:
   - it opens when the word itself is inside the viewport (its top a small margin above the bottom edge), never earlier;
   - it closes when the paragraph's centre reaches the viewport's centre, so every word is in by then;
   - on a paragraph taller than the viewport a word may still be below the fold at that point: it then closes when the word has
     scrolled fully into view (the off-screen rule wins over the centre rule).
   Inside a line the words start one after another, left to right, spread over LINE_SPREAD_VH of scroll. Both rules above win
   over the spread: a line with less room than that gets a smaller spread (same order), never a word earlier or later than allowed.
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
  var LINE_SPREAD_VH = 0.12;           // scroll distance from a line's first word starting to its last word starting, in viewport heights
  var WORD_SPAN_VH = 0.2;              // scroll distance of one word's own pop, at most (shorter than the line spread would make neighbours blur into one fade)
  var PORTRAIT_STAGGER_VH = 0.012;     // portraits only: extra scroll distance per item before them on their line (unchanged since round 1)
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

  var items = [];   // { els, pic, win: [start, end] }
  steps.forEach(function (st) { items.push({ els: st.els, pic: st.pic, win: [0, 0] }); });

  /* Document position of an element from the offsetTop chain: unlike getBoundingClientRect it ignores the transform being animated. */
  function docTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }

  function measure() {
    var H = window.innerHeight, fs = parseFloat(getComputedStyle(text).fontSize) || 16;
    var off = 0.6 * fs;   // WORD_FROM_Y in px (em of the paragraph); the word's start is measured from where its shifted top is
    var pc = docTop(text) + text.offsetHeight / 2;
    var sEnd = pc - H * DONE_AT_VH;
    var margin = ENTER_MARGIN_VH * H, minSpan = MIN_SPAN_VH * H, spread = LINE_SPREAD_VH * H, pStagger = PORTRAIT_STAGGER_VH * H;

    /* Portraits: the round-1 rule, untouched (rank = items before it on its line, words and portraits alike). */
    var lineMid = null, rank = 0;
    items.forEach(function (it) {
      var el = it.els[0], y = docTop(el), h = el.offsetHeight, mid = y + h / 2;
      if (lineMid === null || Math.abs(mid - lineMid) > 0.4 * fs) { lineMid = mid; rank = 0; } else { rank++; }
      if (!it.pic) return;
      var start = y - H + margin + rank * pStagger;
      it.win = [start, Math.max(sEnd, y + h - H, start + minSpan)];
    });

    /* Words: group into lines (portraits do not break a line), then give each line one run of starts left to right.
       base = the first moment the line may animate (its lowest word is margin inside the viewport); limit = the latest it may finish. */
    var lines = [], cur = null, curMid = 0;
    items.forEach(function (it) {
      if (it.pic) return;
      var el = it.els[0], y = docTop(el), h = el.offsetHeight, mid = y + h / 2;
      if (!cur || Math.abs(mid - curMid) > 0.4 * fs) { cur = { list: [], base: -Infinity, limit: -Infinity }; lines.push(cur); curMid = mid; }
      cur.list.push(it);
      cur.base = Math.max(cur.base, y + off - H + margin);
      cur.limit = Math.max(cur.limit, sEnd, y + h - H);
    });
    lines.forEach(function (ln) {
      var n = ln.list.length, room = ln.limit - ln.base;
      /* every word keeps a window of at least minSpan, so the spread is what is left of the room; 1px per gap keeps the order strict.
         All words of a line get the same window length, so the line reads as a wave of equal pops, not one slow fade. */
      var sp = n > 1 ? Math.min(spread, Math.max(room - minSpan, n - 1)) : 0;
      var len = Math.max(Math.min(room - sp, WORD_SPAN_VH * H), minSpan);
      ln.list.forEach(function (it, k) {
        var start = ln.base + (n > 1 ? sp * k / (n - 1) : 0);
        it.win = [start, start + len];
      });
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
