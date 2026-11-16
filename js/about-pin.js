/* About: the Google rating card (Figma 278:178) is pinned in the middle of the screen while the big text scrolls past it
   (cofounder, 2026-11-13). It pins when its centre reaches the viewport's centre and lets go when its bottom edge is level with the bottom
   of the text's last line (cofounder: "once the bottom of the banner is in line with the bottom of the final line of text"); from then on
   it leaves with the text. No pin spacing: the page's
   length and every other trigger stay as they are. The card sits right of the text (x=1183 against the text's 28..958 at 1440), so the
   text passes beside it, never under it.
   768px and up with motion allowed (a pin: webflow-motion mobile law); on phones the card is in the flow under the text and does not pin. */
(function () {
  'use strict';
  function init() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    var about = document.querySelector('.about'), card = about && about.querySelector('.rating-card'), text = about && about.querySelector('.about-text');
    if (!gsap || !ST || !card || !text) return;
    gsap.registerPlugin(ST);
    gsap.matchMedia().add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', function () {
      ST.create({
        id: 'about-pin', trigger: card, pin: true, pinSpacing: false,
        start: 'center center',
        endTrigger: text,
        // the card's bottom level with the bottom of the text's last line. Since the text went to Figma's 48px (2026-11-13) it can end
        // above the card's bottom (768px: the card is the taller one); then there is nothing to slide past and the pin has no length,
        // instead of an end before its start. Document positions from the offsetTop chain, measured on refresh only.
        end: function (self) {
          var top = function (el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
          var start = top(card) + card.offsetHeight / 2 - window.innerHeight / 2;
          return Math.max(start, top(text) + text.offsetHeight - window.innerHeight / 2 - card.offsetHeight / 2);
        },
        invalidateOnRefresh: true, refreshPriority: 2   // above the review pin and everything further down: computed first
      });
    });
  }
  var ready = window.mtmReady || Promise.resolve();
  ready.then(init, init);
})();
