/* Checkerboard transitions (Figma "transition" frames 257:112, 278:122, 257:77), scroll-scrubbed. Cofounder's brief, 2026-11-13:
   going from white to black, the area starts as a fully white canvas and blocks are picked away at random, as in the design,
   until the black underneath is fully revealed; black to white is the inverse. Every transition here goes "down the page":
     .blocks--into-intro         white (services)  -> black (intro)        cells are white over a black ground
     .blocks--out-of-locations   black (Standorte) -> white (review card)  cells are black over a white ground
     .finale__checker            white (news)      -> the team photo       cells are white over the photo
   Each area is a grid of 180x171 cells (Figma's block, 8 across at 1440; everything in vw, so it scales). Every cell gets a
   threshold t in 0..1 once, on load: it shows the colour being left while the area's progress p < t, and is gone (the next
   section shows through) once p >= t. p runs 0 -> 1 from the area's top entering at the bottom of the viewport to its bottom
   leaving at the top, so the area is fully "from" while it enters and fully "to" as it leaves, and scrolling back reverses it.
   The photo's area is different: js/photo-pin.js holds the photo near the top while the footer slides over it (768px and up),
   and the page ends soon after, so it finishes when the photo's top reaches its pin line (its sticky top: 50px at 1440, more on a tall screen): the photo
   is whole before the footer starts to cover it. clamp() keeps every end inside the page's scroll range, so p always reaches 1.
   Thresholds: the cells the Figma design already shows as flipped (read from the static SVG's rects) get t in [0.04, 0.5), the
   rest t in [0.5, 0.96]; inside each half, cells nearer the next section (lower rows) tend to go first, with a random part.
   So p = 0.5 (the area centred in the viewport) is exactly Figma's frame. The random part is seeded: the same order every load.
   No layout reads while scrolling: ScrollTrigger hands over p, and only the cells whose state changes are touched.
   Without GSAP, or under prefers-reduced-motion, nothing here runs and the static Figma SVG stays (css/site.css). */
(function () {
  var CELL_W = 180, CELL_H = 171, COLS = 8;   // Figma units (1440 wide)

  // the areas: the element that becomes the grid's box, its static SVG, where the SVG sits in that box (Figma units), whether
  // the SVG's rects are the cells already flipped ('to') or the ones still showing the old colour ('from'), and how many rows
  var AREAS = [
    { sel: '.blocks--into-intro', svgDx: -4, svgDy: -171, rects: 'to', rows: 5, from: 'paper', seed: 11 },
    { sel: '.blocks--out-of-locations', svgDx: -2, svgDy: -171, rects: 'from', rows: 6, from: 'ink', seed: 23 },
    // Standorte -> the white of the reviews (cofounder's frame, 2026-11-15): white cells APPEAR over the bottom five rows of the
    // locations, from none while it fills the screen (its top at the top of the viewport) to all as it leaves (its bottom at the top);
    // halfway is the frame, whose 20 white cells are below (row by row, 1 = white). No static fallback: under reduced motion no cells.
    // It starts when the section's bottom reaches the bottom of the screen (the section is taller than the screen again since
    // 2026-11-16). 768px and up the section is then pinned while it plays (one screen of scrolling) and leaves all white; on phones no
    // pin (webflow-motion mobile law): it plays while the bottom scrolls up to the top. More rows are added on top when five do not
    // cover the part of the section that is on screen at that moment (one screen tall at most), so it always ends all white on screen;
    // they come in last.
    { sel: '.locations__checker', rows: 5, fill: true, from: 'white', appear: true, seed: 29, trigger: '.locations', start: 'bottom bottom', end: 'bottom top',
      pin: true, pinEnd: '+=100%',
      pattern: [0,0,0,1,0,0,1,0, 1,1,0,0,0,0,0,0, 0,1,1,0,1,0,0,1, 1,0,1,1,1,1,0,0, 1,1,1,0,1,1,1,1] },
    { sel: '.finale__checker', svgDx: 0, svgDy: -171, rects: 'from', rows: 4, from: 'paper', seed: 37, end: function () {   // the pin line: the photo's sticky top where js/photo-pin.js pins it, else the header's 50px
        var f = document.querySelector('.finale'), cs = f && getComputedStyle(f);   // read on refresh only
        var top = cs && cs.position === 'sticky' ? parseFloat(cs.top) : NaN;   // 0 is a real pin line (the photo pins at the very top)
        return 'clamp(top top+=' + (isFinite(top) ? top : 50) + ')';
      } }
  ];

  function rng(seed) {   // mulberry32: small, seeded, good enough for an order
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // which cells the static design shows as flipped: a cell is covered by a rect if the rect contains the cell's centre
  function designFlipped(svg, a) {
    var rects = Array.prototype.map.call(svg.querySelectorAll('rect'), function (r) {
      return { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
    });
    var out = [];
    for (var r = 0; r < a.rows; r++) for (var c = 0; c < COLS; c++) {
      var cx = c * CELL_W + CELL_W / 2 - a.svgDx, cy = r * CELL_H + CELL_H / 2 - a.svgDy;   // the cell centre in SVG units
      var hit = rects.some(function (q) { return cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h; });
      out.push(a.rects === 'to' ? hit : !hit);
    }
    return out;
  }

  function build(box, a) {
    var svg = box.querySelector('svg');
    if (!svg && !a.pattern) return null;
    var rows = a.rows;
    if (a.fill) {   // read once, on build (matchMedia rebuilds it when the layout changes)
      rows = Math.max(a.rows, Math.ceil(Math.min(box.parentNode.getBoundingClientRect().height, window.innerHeight) / (window.innerWidth * 0.11875) - 0.01));
      box.style.height = (rows * 11.875) + 'vw';
    }
    var flipped = a.pattern ? new Array((rows - a.rows) * COLS).fill(false).concat(a.pattern.map(Boolean)) : designFlipped(svg, a), rand = rng(a.seed);
    var grid = document.createElement('div');
    grid.className = 'checker-grid checker-grid--' + a.from;
    grid.setAttribute('aria-hidden', 'true');
    var cells = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++) {
      var i = r * COLS + c, el = document.createElement('i');
      el.style.left = (c * 12.5) + '%';
      el.style.top = (r * 11.875) + 'vw';
      var near = rows > 1 ? (rows - 1 - r) / (rows - 1) : 0;   // 0 on the row next to the next section, 1 on the far row
      var u = 0.55 * near + 0.45 * rand();
      var t = flipped[i] ? 0.04 + 0.46 * u : 0.5 + 0.46 * u;
      cells.push({ el: el, t: t, gone: false });
      grid.appendChild(el);
    }
    box.appendChild(grid);
    return { grid: grid, cells: cells };
  }

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);
    gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 768px)' }, function (ctx) {
      if (!ctx.conditions.motion) return;
      var wide = ctx.conditions.wide;
      var made = [];
      AREAS.forEach(function (a) {
        var box = document.querySelector(a.sel);
        if (!box) return;
        var g = build(box, a);
        if (!g) return;
        box.classList.add('checker-live');
        var apply = function (p) {
          for (var i = 0; i < g.cells.length; i++) {
            var cell = g.cells[i], gone = a.appear ? p < cell.t : p >= cell.t;   // appear: a cell shows once p reaches its t
            if (gone !== cell.gone) { cell.gone = gone; cell.el.style.visibility = gone ? 'hidden' : ''; }
          }
          box.setAttribute('data-checker-p', p.toFixed(3));   // for the tests: the progress the cells were drawn at
        };
        var state = { p: 0 };
        apply(0);   // (an appear area starts with every cell hidden)
        var tw = gsap.to(state, {
          p: 1, ease: 'none',
          scrollTrigger: { trigger: a.trigger || g.grid, start: a.start || 'top bottom', scrub: 0.25,
            end: a.pin && wide ? a.pinEnd : (a.end || 'clamp(bottom top)'), pin: !!(a.pin && wide),
            refreshPriority: a.pin && wide ? 1 : 0 },   // a pin adds a screen of scroll: it must be measured before the triggers below it   // stepped output: 0.2-0.3 (webflow-motion section 7)
          onUpdate: function () { apply(state.p); }
        });
        window.checker = window.checker || {};
        window.checker[a.sel] = { cells: g.cells, trigger: tw.scrollTrigger };
        made.push({ box: box, grid: g.grid, tw: tw });
      });
      if (made.some(function (m) { return m.tw.scrollTrigger && m.tw.scrollTrigger.pin; })) ST.refresh();   // the later sections' triggers (made earlier) re-measure with the pin's space
      return function () {   // reduced motion switched on, or the context reverted: back to the static design
        made.forEach(function (m) { m.tw.kill(); m.grid.remove(); m.box.classList.remove('checker-live'); m.box.removeAttribute('data-checker-p'); m.box.style.height = ''; });
        window.checker = undefined;
      };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
