/* The loader, on every page.
   Home, first visit of the session: the full loader, with the 0 to 100 counter.
   Any page reached through an internal link (the inline <head> script sets is-transition): the same cover and reveal, no counter.
   Leaving a page by an internal link: the cover comes down first (the reveal played backwards), then the browser navigates.
   Produces window.mtmReady (resolves when the loader is done, or at once when it is skipped), and the
   html classes is-loading -> is-loaded ("js", "is-loading" and "is-transition" come from the inline <head> script,
   so there is no flash before the black screen). Later scripts wait on mtmReady. */
(function () {
  'use strict';
  var html = document.documentElement;
  // the inline head script owns the promise (so it exists before this file arrives); fall back to our own
  var resolveReady = window.mtmResolve;
  if (!window.mtmReady || !resolveReady) window.mtmReady = new Promise(function (r) { resolveReady = r; });
  try { performance.mark('mtm-loader-start'); } catch (e) {}

  // html { scroll-behavior: smooth } makes ScrollTrigger's refresh measure with scrollY treated as 0 (its scroll-to-0 and back is
  // animated), so every start/end comes out one scroll offset too small after a mid-page resize or late load. Switch smoothing
  // off for the length of each refresh. Registered before any trigger exists (orbit.js and stack.js wait for mtmReady).
  try {
    var ST = window.ScrollTrigger;
    if (ST && ST.addEventListener) {
      ST.addEventListener('refreshInit', function () { html.style.scrollBehavior = 'auto'; });
      ST.addEventListener('refresh', function () { html.style.scrollBehavior = ''; });
    }
  } catch (e) { /* motion-only: the page works without it */ }

  var loader = document.querySelector('.loader');
  var transition = html.classList.contains('is-transition');   // arrived through an internal link: reveal only, no counter
  var playing = html.classList.contains('is-loading') && loader && window.gsap;
  var done = false, fading = false, hardTimer = 0, run = null;
  var HARD_MS = 6000;   // measured from navigation start, so a slow CDN can not stretch it
  var FADE_MS = 300;    // hard stop while still running: fade the cover out instead of cutting to the page
  var KEY = 'mtm-transition';
  var COVER_S = 0.6;    // the cover coming down: the reveal's dome time, backwards
  var SAFETY_MS = 3000; // navigation blocked or slow: uncover so the page is never left black

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
      html.classList.remove('is-loading', 'is-transition');
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

  setupLeave();   // before the early return: a page that is not playing the loader still covers when it is left

  if (!playing) { finish(); return; }   // ?skiploader, reduced motion, no GSAP: straight to the end

  // the head fallback timer is already cleared, so a throw while building the timeline must not strand the cover
  try {
    var gsap = window.gsap;
    var count = loader.querySelector('.loader__count');   // absent on the subpages, hidden by CSS on a transition
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
    function fontsReady(cap) {
      return Promise.race([
        document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
        new Promise(function (r) { setTimeout(r, cap); })
      ]);
    }

    hardTimer = setTimeout(fadeOutThenFinish, Math.max(0, HARD_MS - performance.now()));
    clearTimeout(window.mtmFallback);   // only now that our own hard stop is armed: the head's 6.6s net is no longer needed

    if (transition) {
      // reveal only: dome up 0.6s, the panel curves away 0.9s starting 0.3s in. It waits for the webfont, capped at 400ms
      // (the font is normally cached by the page that was just left).
      run = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' } });
      run.to(dome, { yPercent: -100, duration: 0.6 }, 0)
         .to(panel, { yPercent: -100, duration: 0.9 }, 0.3)
         .call(finish);
      var play = function () { if (!done && !fading) run.play(); };
      fontsReady(400).then(play, play);
      return;
    }

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
      fontsReady(850).then(go, go);   // a rejected fonts.ready must not strand the page on 100
    }, null, 'hold');
    run.to(count, { yPercent: -40, opacity: 0, duration: 0.35 }, 'hold')
       .to(dome, { yPercent: -100, duration: 0.6 }, 'hold')
       .to(panel, { yPercent: -100, duration: 0.9 }, 'hold+=0.3')
       .call(finish);
  } catch (e) { finish(); }
  // ---- leaving: the cover comes down, then the browser navigates -------------------------------------------------
  function setupLeave() {
    var covering = false, tl = null, timer = 0;
    var skip = /[?&]skiploader\b/.test(location.search);
    var reduced = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

    // "/mtm-coiffure/" and "/mtm-coiffure/index.html" are one page
    function page(p) { return p.replace(/\/index\.html$/, '/'); }

    function uncover() {
      if (!covering) return;
      covering = false;
      clearTimeout(timer);
      try {
        if (tl) tl.kill();
        var el = document.querySelector('.loader');
        if (el) {
          if (window.gsap) window.gsap.killTweensOf(el.querySelectorAll('*'));
          if (el.parentNode) el.parentNode.removeChild(el);
        }
        html.classList.remove('is-loading', 'is-transition');
        Array.prototype.forEach.call(document.querySelectorAll('header, main, footer'), function (e) { e.removeAttribute('inert'); });
      } catch (e) { /* the page must come back whatever else throws */ }
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    }

    function build() {
      var el = document.createElement('div');
      el.className = 'loader';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="loader__panel"></div><div class="loader__dome"></div>';
      document.body.insertBefore(el, document.body.firstChild);
      return el;
    }

    function coverIn(href) {
      var gsap = window.gsap;
      covering = true;
      // the cover starts above the viewport and comes down; set before the classes, so it never flashes in place
      var el = document.querySelector('.loader') || build();
      var panel = el.querySelector('.loader__panel'), dome = el.querySelector('.loader__dome');
      gsap.set([panel, dome], { yPercent: -100 });
      Array.prototype.forEach.call(document.querySelectorAll('header, main, footer'), function (e) { e.setAttribute('inert', ''); });
      html.classList.add('is-loading', 'is-transition');
      timer = setTimeout(uncover, SAFETY_MS);
      tl = gsap.timeline({ defaults: { ease: 'sine.inOut' }, onComplete: function () { location.href = href; } });
      tl.to(panel, { yPercent: 0, duration: COVER_S }, 0).to(dome, { yPercent: 0, duration: COVER_S }, 0);
    }

    // bfcache: the restored page still has its cover-in state (and a stopped clock). Clear it at once.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      uncover();
      if (!done && playing) finish();
    });

    if (skip) return;   // ?skiploader skips everything
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var t = a.getAttribute('target');
      if (t && t !== '_self') return;
      if (a.hasAttribute('download')) return;
      if (!/^https?:$/.test(a.protocol) || a.origin !== location.origin) return;
      if (page(a.pathname) === page(location.pathname)) return;   // same page: a hash change is not a transition
      if (reduced() || !window.gsap) return;
      if (covering) { e.preventDefault(); return; }
      // without sessionStorage the next page could not play its reveal: leave the link alone
      try { sessionStorage.setItem(KEY, '1'); } catch (err) { return; }
      e.preventDefault();
      try { coverIn(a.href); } catch (err) { uncover(); location.href = a.href; }
    });
  }
})();
