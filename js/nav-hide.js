// Header hide on scroll (css/nav-hide.css). Scrolling down past the header's height hides it; any scroll up
// shows it again. A direction only changes after 8px of movement from the last turning point, so a
// mobile URL-bar jitter does not toggle it. Keyboard focus inside the header keeps it visible.
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;

  var T = 8;                              // px of movement before a direction change counts
  var height = header.offsetHeight;       // measured on load/resize, never per frame
  var dir = -1;                           // -1 up (or at rest), 1 down
  var ref = Math.max(0, window.scrollY);  // scrollY at the last turning point of the current run
  var queued = false;

  function update() {
    queued = false;
    var y = Math.max(0, window.scrollY);  // iOS overscroll reports negative values
    var d = y - ref;
    if (dir < 0) {
      if (d < 0) ref = y;
      else if (d >= T) { dir = 1; ref = y; }
    } else {
      if (d > 0) ref = y;
      else if (-d >= T) { dir = -1; ref = y; }
    }
    var hide = dir > 0 && y > height && !header.contains(document.activeElement);
    header.classList.toggle('is-hidden', hide);
  }

  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }

  function measure() { height = header.offsetHeight; schedule(); }

  window.addEventListener('scroll', schedule, { passive: true });
  header.addEventListener('focusin', schedule);
  header.addEventListener('focusout', schedule);
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  measure();
})();
