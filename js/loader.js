/* Home-page loader. Runs only on index.html.
   Produces window.mtmReady (resolves when the loader is done, or at once when it is skipped), and the
   html classes is-loading -> is-loaded ("js" and the first "is-loading" come from the inline <head> script,
   so there is no flash before the black screen). Later scripts wait on mtmReady. */
(function () {
  'use strict';
  var html = document.documentElement;
  // the inline head script owns the promise (so it exists before this file arrives); fall back to our own
  var resolveReady = window.mtmResolve;
  if (!window.mtmReady || !resolveReady) window.mtmReady = new Promise(function (r) { resolveReady = r; });
  try { performance.mark('mtm-loader-start'); } catch (e) {}

  var loader = document.querySelector('.loader');
  var playing = html.classList.contains('is-loading') && loader && window.gsap;
  var done = false, fading = false, hardTimer = 0, run = null;
  var HARD_MS = 6000;   // measured from navigation start, so a slow CDN can not stretch it
  var FADE_MS = 300;    // hard stop while still running: fade the cover out instead of cutting to the page

  function applyHash() {
    var raw = location.hash.slice(1), id = raw;
    if (!raw) return;
    try { id = decodeURIComponent(raw); } catch (e) { /* malformed escape: use the text as written */ }
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  // runs once on every path; mtmReady resolves in the finally whatever else throws
  function finish() {
    if (done) return;
    done = true;
    try {
      clearTimeout(hardTimer);
      if (run) run.kill();
      if (window.gsap && loader) window.gsap.killTweensOf(loader.querySelectorAll('*'));
      if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
      html.classList.remove('is-loading');
      html.classList.add('is-loaded');
      Array.prototype.forEach.call(document.querySelectorAll('header, main, footer'), function (e) { e.removeAttribute('inert'); });
    } catch (e) { /* fall through to resolve */ }
    try { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); } catch (e) {}
    try { applyHash(); } catch (e) {}
    finally { resolveReady(); }
  }

  // CSS transition, not a tween: it still plays when GSAP's ticker is stalled
  function fadeOutThenFinish() {
    if (done || fading) return;
    fading = true;
    if (run) run.kill();   // the timeline's own finish() must not cut the fade short
    loader.style.transition = 'opacity ' + FADE_MS + 'ms ease-in-out';
    loader.style.opacity = '0';
    setTimeout(finish, FADE_MS + 20);
  }

  if (!playing) { finish(); return; }   // ?skiploader, reduced motion, no GSAP: straight to the end

  // the head fallback timer is already cleared, so a throw while building the timeline must not strand the cover
  try {
    var gsap = window.gsap;
    var count = loader.querySelector('.loader__count');
    var dome = loader.querySelector('.loader__dome');
    var panel = loader.querySelector('.loader__panel');
    var ROLL = 0.18;
    var nums = [loader.querySelector('.loader__num')];
    var shown = 0, lastAt = 0;

    // each new number rolls in from below while the previous one leaves upward
    function show(n) {
      if (n === shown) return;
      shown = n;
      // Mid-ease the number changes every ~15ms, faster than any roll could read. Below ~50ms between changes
      // the number swaps hard; slower than that (the start and the end of the ease) it rolls, over at most 0.18s.
      var now = performance.now();
      var dur = lastAt ? Math.min(ROLL, (now - lastAt) / 1000 * 0.9) : ROLL;
      lastAt = now;
      var el = document.createElement('span');
      el.className = 'loader__num';
      el.textContent = n;
      count.appendChild(el);
      var prev = nums[nums.length - 1];
      if (dur < 0.05) {
        gsap.killTweensOf(prev);
        if (prev.parentNode) prev.parentNode.removeChild(prev);
        nums.pop();
      } else {
        gsap.fromTo(el, { yPercent: 100 }, { yPercent: 0, duration: dur, ease: 'sine.inOut', overwrite: true });
        gsap.to(prev, { yPercent: -100, duration: dur, ease: 'sine.inOut', overwrite: true });
      }
      nums.push(el);
      // keep only the newest few spans in the DOM
      while (nums.length > 3) {
        var old = nums.shift();
        gsap.killTweensOf(old);
        if (old.parentNode) old.parentNode.removeChild(old);
      }
      gsap.delayedCall(ROLL, function () {
        while (nums.length > 1 && !gsap.isTweening(nums[0])) {
          var o = nums.shift();
          if (o.parentNode) o.parentNode.removeChild(o);
        }
      });
    }

    var counter = { v: 0 };
    // The reveal does not wait for window.load (the hung-asset case). It waits for the webfont, but never longer than
    // the 1s that follows the count reaching 100 (0.15s hold + up to 0.85s here, timed from the end of the count).
    function fontsReady() {
      return Promise.race([
        document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
        new Promise(function (r) { setTimeout(r, 850); })
      ]);
    }

    hardTimer = setTimeout(fadeOutThenFinish, Math.max(0, HARD_MS - performance.now()));
    clearTimeout(window.mtmFallback);   // only now that our own hard stop is armed: the head's 6.6s net is no longer needed

    run = gsap.timeline({ defaults: { ease: 'sine.inOut' } });
    run.to(counter, {
      v: 100, duration: 2.0,
      onUpdate: function () { show(Math.round(counter.v)); },
      onComplete: function () { show(100); }
    });
    run.addLabel('hold', '+=0.15');
    // the reveal waits for the webfont (capped), then plays: dome up, black panel up
    run.call(function () {
      run.pause();
      var go = function () { if (!done && !fading) run.play(); };
      fontsReady().then(go, go);   // a rejected fonts.ready must not strand the page on 100
    }, null, 'hold');
    run.to(count, { yPercent: -40, opacity: 0, duration: 0.35 }, 'hold')
       .to(dome, { yPercent: -100, duration: 0.6 }, 'hold')
       .to(panel, { yPercent: -100, duration: 0.9 }, 'hold+=0.3')
       .call(finish);
  } catch (e) { finish(); }
})();
