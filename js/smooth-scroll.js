/* Smooth scroll for the whole page (Lenis 1.3.11, cofounder, 2026-11-13), set up as in the webflow-motion Tier 0 recipe:
   - one animation loop: GSAP's ticker drives Lenis (autoRaf off), and every Lenis scroll updates ScrollTrigger, so the pins, scrubs and
     blocks on this page follow the smoothed position frame by frame;
   - touch keeps the phone's native scrolling (syncTouch off: webflow-motion mobile law, rule 4); only wheel and trackpad are smoothed;
   - in-page links (#standorte) glide to their target and stop below the header (anchors offset = the header's height), as the CSS
     scroll-padding-top did for the native jump;
   - nested scroll areas (the team gallery's phone scroller) keep their own scrolling (allowNestedScroll);
   - while the loader covers the page (html.is-loading) Lenis is stopped, and starts when window.mtmReady resolves;
   - prefers-reduced-motion: no Lenis at all, the browser's own scrolling; switching the setting on or off later adds or removes it.
   Loaded right after GSAP and ScrollTrigger, before every other script, so their triggers are created with Lenis already in place.
   Lenis's own CSS (dist/lenis.css of the same version) is in css/site.css; it also turns off html { scroll-behavior: smooth } while it runs. */
(function () {
  'use strict';
  var gsap = window.gsap, ST = window.ScrollTrigger, Lenis = window.Lenis;
  if (!gsap || !ST || !Lenis) return;   // a script failed to load: the page simply scrolls natively
  gsap.registerPlugin(ST);
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lenis = null, tick = null;

  function start() {
    if (lenis) return;
    var header = document.querySelector('.site-header');
    lenis = new Lenis({
      autoRaf: false,
      syncTouch: false,
      allowNestedScroll: true,
      anchors: { offset: -(header ? header.offsetHeight : 50) }
    });
    lenis.on('scroll', ST.update);
    tick = function (time) { lenis.raf(time * 1000); };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis;
    if (document.documentElement.classList.contains('is-loading')) {
      lenis.stop();
      var ready = window.mtmReady || Promise.resolve();
      ready.then(function () { if (lenis) lenis.start(); }, function () { if (lenis) lenis.start(); });
    }
  }

  function stop() {
    if (!lenis) return;
    gsap.ticker.remove(tick);
    lenis.destroy();
    lenis = null; tick = null;
    gsap.ticker.lagSmoothing(500, 33);   // GSAP's default
    window.lenis = undefined;
  }

  if (!mq.matches) start();
  var onChange = function (e) { if (e.matches) stop(); else start(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
})();
