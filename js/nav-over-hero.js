/* Home page: the header is see-through (.is-over-hero: no background, white text, the white logo; css/site.css) while something
   dark fills the strip behind it, and the white Figma bar otherwise:
   - the hero video, while it still reaches the header's bottom edge (so the white text never sits over the white page below it);
   - the team photo above the footer, while it covers the header's top edge (2026-11-13: it pins at the very top and fills the screen,
     css/photo-pin.css), unless the footer, sliding up over the photo, has reached the header's bottom edge.
   IntersectionObservers whose root boxes are 1px lines at the header's bottom and top edges: no scroll handler, no layout reads per
   frame. Without this script the header simply stays white. */
(function () {
  var header = document.querySelector('.site-header'), hero = document.querySelector('.hero');
  if (!header || !hero || !('IntersectionObserver' in window)) return;
  var photo = document.querySelector('.news .finale'), footer = document.querySelector('.site-footer');
  var navH = header.offsetHeight || 50;
  var on = { hero: false, photo: false, footer: false }, ios = [];
  function apply() { header.classList.toggle('is-over-hero', on.hero || (on.photo && !on.footer)); }
  function line(y, els) {   // a 1px root box at viewport y; els: [[element, key], ...]
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { on[e.target === hero ? 'hero' : e.target === footer ? 'footer' : 'photo'] = e.isIntersecting; });
      apply();
    }, { rootMargin: (-y) + 'px 0px ' + (y + 1 - window.innerHeight) + 'px 0px' });
    els.forEach(function (el) { if (el) io.observe(el); });
    ios.push(io);
  }
  function watch() {
    ios.forEach(function (io) { io.disconnect(); }); ios = [];
    line(navH - 1, [hero, footer]);   // the header's bottom edge
    line(0, [photo]);                 // the header's top edge: the photo must cover the whole strip
  }
  watch();
  var lastH = window.innerHeight;
  window.addEventListener('resize', function () {   // the root margins depend on the viewport height; ignore URL-bar jitter
    if (Math.abs(window.innerHeight - lastH) > 150) { lastH = window.innerHeight; watch(); }
  });
})();
