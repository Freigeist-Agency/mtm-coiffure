/* Text reveal, driven by scroll: first on the intro ("Wir sind ein Familienfriseurbetrieb...", index.html .intro-text); since
   2026-11-15 (cofounder: "apply it to all paragraphs") on every running-text paragraph: the services text, the social text, the news
   intro and the two news cards, and the FAQ's about text. Left out on purpose: one-line labels (Willkommen., 171 Bewertungen), text
   with links in it (the addresses with phone numbers: the split copy is hidden from screen readers, and the links must stay
   reachable), the review quotes (their own carousel motion), and the FAQ answers (inside closed rows, nothing to scroll past).
   2026-11-13 (cofounder): line by line, not word by word. Each line rises and fades in as one, with the same pop as before.
   The HTML stays a plain sentence; this script splits it into inline-block words at runtime, groups them into the lines the browser
   laid them out on, and gives every line (and every portrait) its own scrubbed scroll window, so scrolling back up reverses it.
   Lines are measured again on every refresh (resize, fonts), so a different line break on a phone is still revealed line by line.
   Rules for a line's window:
   - it opens when the line itself is inside the viewport (its top a small margin above the bottom edge), never earlier;
   - it closes when the paragraph's centre reaches the viewport's centre, so every line is in by then;
   - on a paragraph taller than the viewport a line may still be below the fold at that point: it then closes when the line has
     scrolled fully into view (the off-screen rule wins over the centre rule).
   Window positions are measured on load / refresh and cached; nothing is measured while scrolling.
   Nothing happens (text stays plain and fully visible) without GSAP/ScrollTrigger or under prefers-reduced-motion. */
(function () {
  'use strict';

  /* ---- motion values: the only place to tune the effect ---- */
  var LINE_FROM_Y = '0.6em';           // a line starts this far below its place
  var LINE_FROM_OPACITY = 0;
  var PORTRAIT_FROM_SCALE = 0.8;       // the three round portraits grow from this scale (2026-11-13, cofounder: 0.8 -> 1)
  var EASE = 'back.out(1.7)';          // the pop (overshoot), applied over each line's own scroll window
  var PORTRAIT_EASE = 'sine.in';       // portraits: a sine-in grow over their own scroll window (2026-11-13, cofounder)
  var ENTER_MARGIN_VH = 0.03;          // a line's reveal starts when its (shifted) top is this far above the bottom edge, in viewport heights
  var DONE_AT_VH = 0.5;                // every line is in when the paragraph centre is at this height of the viewport (0.5 = centre)
  var LINE_SPAN_VH = 0.2;              // scroll distance of one line's pop, at most
  var PORTRAIT_STAGGER_VH = 0.012;     // portraits only: extra scroll distance per item before them on their line (unchanged since round 1)
  var MIN_SPAN_VH = 0.03;              // no window is shorter than this, in viewport heights
  var TEXTS = [['.intro-text', 'word-reveal-'], ['.about-text', 'about-reveal-'],   // paragraph(s), ScrollTrigger id prefix
    ['.services-text', 'services-reveal-'], ['.social-head p', 'social-reveal-'], ['.news-head p', 'news-reveal-'],
    ['.news-card p', 'newscard-reveal-'], ['.faq__about', 'faqabout-reveal-']];

  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.registerPlugin(ScrollTrigger);

  /* Document position of an element from the offsetTop chain: unlike getBoundingClientRect it ignores the transform being animated. */
  function docTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }

  function reveal(text, idPrefix) {
    if (!text || text.__wordReveal) return;
    text.__wordReveal = true;

    /* One screen-reader copy, so the sentence is read once and normally; the split words are hidden from assistive tech. */
    var sr = document.createElement('p');
    sr.className = 'wr-sr';
    sr.textContent = text.textContent.replace(/\s+/g, ' ').trim();
    text.parentNode.insertBefore(sr, text);
    text.setAttribute('aria-hidden', 'true');

    /* Split every text node into inline-block words; whitespace stays as real text nodes. A word also ends after a hyphen
       ("Familienfriseur-" + "betrieb"), because the browser may break the line there and a single inline-block would not.
       `items` is the reading order, one entry per word piece or portrait. */
    var items = [];   // { el, pic, win: [start, end] }
    function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            part.match(/[^-]+-?|-/g).forEach(function (piece) {
              var w = document.createElement('span');
              w.className = 'wr-word';
              w.textContent = piece;
              frag.appendChild(w);
              items.push({ el: w, pic: false, win: [0, 0] });
            });
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          if (n.tagName === 'IMG') items.push({ el: n, pic: true, win: [0, 0] });
          else if (n.tagName !== 'BR') split(n);
        }
      });
    }
    split(text);

    function measure() {
      var H = window.innerHeight, fs = parseFloat(getComputedStyle(text).fontSize) || 16;
      var off = 0.6 * fs;   // LINE_FROM_Y in px (em of the paragraph); a line's start is measured from where its shifted top is
      var sEnd = docTop(text) + text.offsetHeight / 2 - H * DONE_AT_VH;
      var margin = ENTER_MARGIN_VH * H, minSpan = MIN_SPAN_VH * H, pStagger = PORTRAIT_STAGGER_VH * H;

      /* Portraits: the round-1 rule, untouched (rank = items before it on its line, words and portraits alike). */
      var lineMid = null, rank = 0;
      items.forEach(function (it) {
        var y = docTop(it.el), h = it.el.offsetHeight, mid = y + h / 2;
        if (lineMid === null || Math.abs(mid - lineMid) > 0.4 * fs) { lineMid = mid; rank = 0; } else { rank++; }
        if (!it.pic) return;
        var start = y - H + margin + rank * pStagger;
        it.win = [start, Math.max(sEnd, y + h - H, start + minSpan)];
      });

      /* Words: grouped into the lines they sit on (portraits do not break a line); every word of a line gets the line's one window.
         base = the first moment the line may animate (its lowest word is margin inside the viewport); limit = the latest it may finish. */
      var lines = [], cur = null, curMid = 0;
      items.forEach(function (it) {
        if (it.pic) return;
        var y = docTop(it.el), h = it.el.offsetHeight, mid = y + h / 2;
        if (!cur || Math.abs(mid - curMid) > 0.4 * fs) { cur = { list: [], base: -Infinity, limit: -Infinity }; lines.push(cur); curMid = mid; }
        cur.list.push(it);
        cur.base = Math.max(cur.base, y + off - H + margin);
        cur.limit = Math.max(cur.limit, sEnd, y + h - H);
      });
      lines.forEach(function (ln) {
        var len = Math.max(Math.min(ln.limit - ln.base, LINE_SPAN_VH * H), minSpan);
        ln.list.forEach(function (it) { it.win = [ln.base, ln.base + len]; });
      });
    }
    var dirty = true;
    function win(i) { if (dirty) { measure(); dirty = false; } return items[i].win; }
    ScrollTrigger.addEventListener('refreshInit', function () { dirty = true; });

    items.forEach(function (it, i) {
      var from = it.pic
        ? { scale: PORTRAIT_FROM_SCALE }                 // portraits: no fade, only the grow (2026-11-13, cofounder)
        : { y: LINE_FROM_Y, opacity: LINE_FROM_OPACITY };
      var to = it.pic ? { scale: 1 } : { y: 0, opacity: 1 };
      to.ease = it.pic ? PORTRAIT_EASE : EASE; to.duration = 1;
      gsap.fromTo(it.el, from, Object.assign(to, {
        scrollTrigger: { start: function () { return win(i)[0]; }, end: function () { return win(i)[1]; }, id: idPrefix + i, scrub: true, invalidateOnRefresh: true }
      }));
    });
  }

  TEXTS.forEach(function (t) {
    var all = document.querySelectorAll(t[0]);
    Array.prototype.forEach.call(all, function (el, k) { reveal(el, all.length > 1 ? t[1] + k + '-' : t[1]); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
