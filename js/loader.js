/* Home-page loader. Runs only on index.html.
   Produces window.mtmReady (resolves when the loader is done, or at once when it is skipped), and the
   html classes is-loading -> is-loaded ("js" and the first "is-loading" come from the inline <head> script,
   so there is no flash before the black screen). Later scripts wait on mtmReady. */
(function () {
  'use strict';
  var html = document.documentElement;
  var resolveReady;
  window.mtmReady = new Promise(function (r) { resolveReady = r; });
  try { performance.mark('mtm-loader-start'); } catch (e) {}

  var loader = document.querySelector('.loader');
  var playing = html.classList.contains('is-loading') && loader && window.gsap;
  var done = false, hardTimer = 0, run = null;
  var HARD_MS = 6000;   // measured from navigation start, so a slow CDN can not stretch it

  function applyHash() {
    var id = location.hash && decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(hardTimer);
    if (run) run.kill();
    if (window.gsap && loader) window.gsap.killTweensOf(loader.querySelectorAll('*'));
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    html.classList.remove('is-loading');
    html.classList.add('is-loaded');
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    applyHash();
    resolveReady();
  }

  if (!playing) { finish(); return; }   // ?skiploader, reduced motion, no GSAP: straight to the end

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
  var pageLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(function (r) { window.addEventListener('load', r, { once: true }); });

  hardTimer = setTimeout(finish, Math.max(0, HARD_MS - performance.now()));

  run = gsap.timeline({ defaults: { ease: 'sine.inOut' } });
  run.to(counter, {
    v: 100, duration: 2.0,
    onUpdate: function () { show(Math.round(counter.v)); },
    onComplete: function () { show(100); }
  });
  run.addLabel('hold', '+=0.15');
  // the reveal waits for the page (up to the hard timeout), then plays: dome up, black panel up
  run.call(function () {
    run.pause();
    pageLoaded.then(function () { if (!done) run.play(); });
  }, null, 'hold');
  run.to(count, { yPercent: -40, opacity: 0, duration: 0.35 }, 'hold')
     .to(dome, { yPercent: -100, duration: 0.6 }, 'hold')
     .to(panel, { yPercent: -100, duration: 0.9 }, 'hold+=0.3')
     .call(finish);
})();
