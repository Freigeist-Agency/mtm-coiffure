/* Team photo above the footer (cofounder, 2026-11-16).
   768px and up: the photo pins with its top PIN_AT of the screen down (asked for "about 5-10%") and stays pinned to the end of the
   page, so the footer slides up over it. While pinned it first scales from 100% to 105% around its centre over GROW_VH of a screen of
   scrolling, scrubbed with sine in-out (as the hero's shrink, js/hero-shrink.js); the footer starts to arrive only after that: the
   section gets that much extra space below it while pinned, more when the photo is shorter than the screen. Scrolling back reverses it all.
   Below 768 no pin (webflow-motion mobile law): the photo grows while it crosses the screen and the footer follows it as usual.
   Its 20px corners stay 20px on screen: the corner is multiplied by --fin-k, 1 down to 1 / 1.05, while the photo is scaled up.
   Under reduced motion nothing moves. */
(function () {
  'use strict';
  var TO = 1.05, GROW_VH = 0.6, PIN_AT = '7.5%', EASE = 'sine.inOut';

  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger, img = document.querySelector('.finale-photo img');
    if (!gsap || !ST || !img) return;
    var section = img.parentNode, footer = document.querySelector('.site-footer');
    gsap.registerPlugin(ST);
    var mm = gsap.matchMedia();

    function grow(trigger) {
      return gsap.fromTo(img, { scale: 1, '--fin-k': 1 }, { scale: TO, '--fin-k': 1 / TO, ease: EASE, transformOrigin: '50% 50%', scrollTrigger: trigger });
    }

    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      // the room below the section for the grow before the footer comes: GROW_VH of a screen, plus the gap under the photo when it is
      // shorter than the screen below the pin line (else the footer would already show there). Set on every refresh, before measuring.
      function room() {
        var h = window.innerHeight, under = Math.max(0, h - (h * parseFloat(PIN_AT) / 100 + img.offsetHeight));
        section.style.marginBottom = (GROW_VH * h + under) + 'px';
      }
      room(); ST.addEventListener('refreshInit', room);
      section.classList.add('is-pinned');
      if (footer) footer.classList.add('is-over-photo');   // the footer is drawn over the pinned photo
      var tw = grow({ id: 'photo-grow', trigger: img, start: 'top ' + PIN_AT, end: function () { return '+=' + window.innerHeight * GROW_VH; }, scrub: 0.5, invalidateOnRefresh: true });
      var pin = ST.create({ id: 'photo-pin', trigger: img, pin: section, pinSpacing: false, start: 'top ' + PIN_AT,
        endTrigger: document.documentElement, end: 'bottom bottom', invalidateOnRefresh: true });
      ST.refresh();
      return function () {
        ST.removeEventListener('refreshInit', room); section.style.marginBottom = '';
        pin.kill(); tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill();
        gsap.set(img, { clearProps: 'transform,--fin-k' });
        section.classList.remove('is-pinned'); if (footer) footer.classList.remove('is-over-photo');
      };
    });
    mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', function () {
      var tw = grow({ id: 'photo-grow', trigger: img, start: 'top bottom', end: 'bottom top', scrub: 0.5 });
      return function () { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); gsap.set(img, { clearProps: 'transform,--fin-k' }); };
    });
  }

  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
