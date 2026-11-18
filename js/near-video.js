/* Location-card videos (home page, Standorte): they used to autoplay, which made the browser download them as the page loaded
   even though they sit far down the page (the Waldbröl one is 2.6 MB on desktop). Now each starts when it comes within one
   screen of the viewport and pauses when it leaves; the poster shows until then, as it did while an autoplay video loaded.
   Same files, same quality. Without IntersectionObserver they simply play straight away, as before. */
(function () {
  'use strict';
  var videos = document.querySelectorAll('video[data-play-near]');
  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }   // a blocked play leaves the poster up
  if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(videos, play); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) play(e.target); else e.target.pause(); });
  }, { rootMargin: '100% 0px' });
  Array.prototype.forEach.call(videos, function (v) { io.observe(v); });
})();
