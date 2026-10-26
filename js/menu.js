/* MTM-Coiffure logo menu. Ported from studio/References/logo-menu-embed.html (Webflow embed).
   Requires window.gsap (loaded once per page before this file). */
(function(){
  if (window.__mtmLogoMenuInit) return;   // idempotency guard
  window.__mtmLogoMenuInit = true;

  function init(){
    if (!window.gsap) return;             // never inject our own GSAP

    var root = document.createElement('div');
    root.className = 'lm-root';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','Menü');
    // .lm-frost is the FIRST child so it paints beneath the opaque panels
    // (it also carries its own lower z-index — see the CSS). Each triangle is
    // a wrapper (.lm-tri/.lm-tri-up/.lm-tri-lo, carries the drop-shadow) around
    // an inner .lm-tri-shape (carries the clip-path and the fill) — a shadow
    // on the same element as a clip-path is clipped away with it.
    root.innerHTML =
      '<div class="lm-frost"></div>' +
      '<div class="lm-tri lm-tri-up"><div class="lm-tri-shape"></div></div>' +
      '<div class="lm-tri lm-tri-lo"><div class="lm-tri-shape"></div></div>' +
      '<div class="lm-bar lm-bar-top"></div>' +
      '<div class="lm-bar lm-bar-bot"></div>';
    document.body.appendChild(root);

    var ROOT = document.documentElement.getAttribute('data-root') || '';
    var CFG = {
      closeScale: 1/0.75,
      // --- PLACEHOLDER COPY. Swap these strings; nothing else needs to change. ---
      // Links resolve against data-root on <html> ("" on the homepage,
      // "../" on pages one folder down), so the same file works everywhere.
      links: [
        { label: 'Leistungen',    href: ROOT + 'index.html#leistungen' },
        { label: 'Über uns',      href: ROOT + 'index.html#ueber-uns' },
        { label: 'Standorte',     href: ROOT + 'index.html#standorte' },
        { label: 'Termin buchen', href: ROOT + 'index.html#standorte' } // TODO(content): real booking URL
      ],
      // TODO(content): addresses, phone numbers and hours are placeholders.
      locations: [
        { name: 'Waldbröl',  address: 'Hauptstraße 12, 51545 Waldbröl',
          phone: '02291 000000', hours: 'Di–Fr 9–18 · Sa 9–14' },
        { name: 'Nümbrecht', address: 'Hauptstraße 34, 51588 Nümbrecht',
          phone: '02293 000000', hours: 'Di–Fr 9–18 · Sa 9–14' }
      ],
      // Font sizes in vh, largest first — each link sits lower, where the wedge is
      // narrower, so the scale steps down to match. fitText() shrinks further if needed.
      linkSizes: [7, 6, 5, 4.2],
      locNameSize: 3.2,
      locLineSize: 1.5
    };
    var tl = null;

    function buildContent(){
      // Content goes inside .lm-tri-shape (the clipped inner element), not the
      // .lm-tri-up/.lm-tri-lo wrapper — the wrapper only carries the shadow now.
      var up = root.querySelector('.lm-tri-up > .lm-tri-shape'),
          lo = root.querySelector('.lm-tri-lo > .lm-tri-shape');

      var links = document.createElement('nav');
      links.className = 'lm-links';
      CFG.links.forEach(function(l, i){
        var a = document.createElement('a');
        a.className = 'lm-link';
        a.href = l.href;
        a.textContent = l.label;
        a.style.fontSize = (CFG.linkSizes[i] || CFG.linkSizes[CFG.linkSizes.length-1]) + 'vh';
        links.appendChild(a);
      });
      up.appendChild(links);

      var locs = document.createElement('div');
      locs.className = 'lm-locs';
      CFG.locations.forEach(function(loc){
        var d = document.createElement('div');
        d.className = 'lm-loc';
        d.innerHTML =
          '<span class="lm-loc-name" style="font-size:'+CFG.locNameSize+'vh"></span>' +
          '<span class="lm-loc-line" style="font-size:'+CFG.locLineSize+'vh"></span>' +
          '<span class="lm-loc-line" style="font-size:'+CFG.locLineSize+'vh"></span>' +
          '<span class="lm-loc-line" style="font-size:'+CFG.locLineSize+'vh"></span>';
        d.querySelector('.lm-loc-name').textContent = loc.name;
        var lines = d.querySelectorAll('.lm-loc-line');
        lines[0].textContent = loc.address;
        lines[1].textContent = loc.phone;
        lines[2].textContent = loc.hours;
        locs.appendChild(d);
      });
      lo.appendChild(locs);
    }

    // Width available inside a triangle at viewport y (px).
    // Upper: full width at 16.74vh, zero at 70.48vh (bottom-left vertex).
    // Lower: zero at 29.07vh (top-right vertex), full at 83.26vh.
    function availableWidth(el, y){
      var vw = window.innerWidth, vh = window.innerHeight, t;
      if (el.closest('.lm-tri-up')) t = 1 - (y - 0.1674*vh) / (0.5374*vh);
      else                          t = (y - 0.2907*vh) / (0.5419*vh);
      return Math.max(0, Math.min(1, t)) * 0.9894 * vw;
    }

    // Anything wider than its wedge would be silently clipped by the triangle —
    // invisible, not obviously broken. Shrink until it fits. 0.92 leaves a margin
    // so glyphs never touch the hypotenuse.
    //
    // Why the scale goes through GSAP and not el.style.transform: the same
    // elements are animated by buildTimeline()'s
    // fromTo(items, {opacity:0,y:12}, {opacity:1,y:0,...}) stagger. GSAP writes
    // the FULL transform matrix on every tween, so a scale applied via
    // el.style.transform would be erased the instant the stagger runs — and
    // because the triangle's clip-path hides overflow, an oversized link would
    // just silently vanish rather than look broken. So fitText() measures and
    // applies scale entirely through GSAP (gsap.set), which owns the transform
    // and composites scale with the stagger's y-tween instead of being clobbered
    // by it.
    function fitText(){
      root.querySelectorAll('.lm-link, .lm-loc-name, .lm-loc-line').forEach(function(el){
        gsap.set(el, { scale: 1 });
        var r = el.getBoundingClientRect();
        var avail = availableWidth(el, r.top + r.height/2) * 0.92;
        // Subtract the element's own inset from the triangle's vertical edge.
        var inset = el.closest('.lm-links')
          ? r.left - 0.0053*window.innerWidth
          : (0.9947*window.innerWidth) - r.right;
        avail -= Math.max(0, inset);
        if (avail > 0 && r.width > avail){
          var s = avail / r.width;
          gsap.set(el, {
            transformOrigin: el.closest('.lm-links') ? 'left center' : 'right center',
            scale: s
          });
        }
      });
      enforceLinkStaircase();
    }

    // The wedge narrows downward, so the type is authored to step down with it
    // (CFG.linkSizes is descending). But the fit above is per-element: a long
    // label near the top can be shrunk harder than a short label below it, and
    // the staircase INVERTS. Measured at 375x812 before this pass:
    // "Leistungen" fitted to 46.0px sitting directly above "Über uns" at
    // 47.9px. Authoring smaller sizes cannot fix it — which link the fit binds
    // on depends on the copy, and the copy is a placeholder someone will swap.
    // So clamp after fitting: each link's EFFECTIVE size (css px * applied
    // scale) may never exceed the one above it. Only ever shrinks, so it can
    // neither un-fit an element nor push one past its wedge.
    function enforceLinkStaircase(){
      var prev = Infinity;
      root.querySelectorAll('.lm-link').forEach(function(el){
        var fs = parseFloat(getComputedStyle(el).fontSize) || 0;
        var cur = fs * (gsap.getProperty(el, 'scaleX') || 1);
        if (cur > prev && fs > 0){
          gsap.set(el, { transformOrigin: 'left center', scale: prev / fs });
          cur = prev;
        }
        prev = cur;
      });
    }

    buildContent();

    // Every number fitText() computes comes from the metrics of whatever font
    // is actually resolved at measurement time. If Geomini has not finished
    // loading, .lm-link resolves to the sans-serif fallback and the fit is
    // computed against the WRONG metrics — and because the triangle clips,
    // over-wide text is invisible rather than visibly broken. Re-fit once the
    // real face is in. Registered after buildContent(), inside init(), so the
    // callback can never run before there is anything to fit.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then){
      document.fonts.ready.then(function(){ fitText(); });
    }

    // The hypotenuse in RENDERED pixels. In the SVG's own coordinates the
    // perpendicular is ~56.6 deg, but the mark is stretched full-bleed, so x and y
    // scale differently: at 1440x900 the real perpendicular is ~71.3 deg. Never
    // hard-code the angle — recompute it from the live viewport.
    function entryVec(){
      var vw = window.innerWidth, vh = window.innerHeight;
      var hx = -0.9894 * vw;            // upper hypotenuse runs right-to-left...
      var hy =  0.5374 * vh;            // ...and downward
      var px =  hy, py = -hx;           // perpendicular; hx<0 and hy>0 => points down-right
      var m = Math.sqrt(px*px + py*py);
      var k = Math.sqrt(vw*vw + vh*vh); // viewport diagonal: guarantees fully off-screen
      return { x: px/m*k, y: py/m*k };
    }

    function reduced(){
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function buildTimeline(){
      var v = entryVec();
      var up = root.querySelector('.lm-tri-up'), lo = root.querySelector('.lm-tri-lo');
      var bt = root.querySelector('.lm-bar-top'), bb = root.querySelector('.lm-bar-bot');
      var t = gsap.timeline({ paused: true });

      if (reduced()){
        // No travel, no stagger — assemble the same final state instantly.
        t.set([up,lo,bt,bb], { x:0, y:0, scaleX:1 })
         .set(root.querySelectorAll('.lm-link, .lm-loc'), { opacity:1, y:0 })
         .fromTo(root, { opacity:0 }, { opacity:1, duration:0.15 }, 0);
        return t;
      }

      t.fromTo(up, { x:-v.x, y:-v.y }, { x:0, y:0, duration:0.7, ease:'power3.out' }, 0)
       .fromTo(lo, { x: v.x, y: v.y }, { x:0, y:0, duration:0.7, ease:'power3.out' }, 0.06)
       .fromTo(bt, { scaleX:0 }, { scaleX:1, duration:0.5, ease:'power3.out' }, 0.10)
       .fromTo(bb, { scaleX:0 }, { scaleX:1, duration:0.5, ease:'power3.out' }, 0.10);

      var items = root.querySelectorAll('.lm-link, .lm-loc');
      // 0.76 = lower triangle's start (0.06) + its duration (0.7): links begin
      // exactly as the panels lock, never during their travel.
      t.fromTo(items, { opacity:0, y:12 },
               { opacity:1, y:0, duration:0.4, stagger:0.05, ease:'power2.out' }, 0.76);
      return t;
    }

    // The live button is <a class="link-block"><div class="div-block-4">
    // <div class="text-block-3">menü</div><img class="icon _2"></div></a>.
    // Match on the word, not the class chain: Webflow class names are volatile
    // and lowercased in published output, but the label is content.
    function findButton(){
      var as = document.querySelectorAll('a');
      for (var i=0;i<as.length;i++){
        var t = as[i].textContent || '';
        // "menü" can arrive as precomposed U+00FC or as "u" + U+0308 (combining
        // diaeresis) — the CMS, the designer's clipboard and macOS filenames all
        // produce the decomposed form. They render identically but are different
        // code-point sequences, and [üu] only matches the precomposed one.
        if (t.normalize) t = t.normalize('NFC');
        if (/^\s*men[üu]\s*$/i.test(t)) return as[i];
      }
      return null;
    }

    var btn = findButton();
    if (!btn && window.console && console.warn){
      console.warn('[mtm-logo-menu] no "menü" link found — the button cannot toggle the menu. ' +
                   'Check the label text, or wire a click handler to window.__lmDebug.open().');
    }
    var scrollLocked = false;

    // The overlay (z-index 9998) covers the whole viewport, and the menu button
    // sits at top-left — INSIDE the sand top bar. Without this, the button is
    // unclickable the moment the menu opens and the spec's "button toggles" is
    // impossible. Raising the button alone does not work: .container-2 has
    // backdrop-filter, which creates a stacking context the button cannot escape.
    // So raise an ANCESTOR of the button (.div-block-3 on the live site, .nav in
    // the harness), and restore it exactly on close.
    //
    // But the walk must be capped. Ascending blindly to the outermost element
    // below <body> is only safe while that element contains nothing but the nav.
    // On the live site it does: the button's outermost ancestor below <body> is
    // .div-block-3, a ~615-byte subtree holding just the logo and the menü
    // button, with the hero <section> as a following sibling (.div-block-26
    // closes before .div-block-3 and is a sibling, not an ancestor). Re-nest that
    // in the Webflow Designer so the outer wrapper also holds page content, and
    // the blind walk lifts THE WHOLE PAGE to z-index 9999 — above the 9998
    // overlay. The menu then opens and is completely buried: elementFromPoint in
    // the triangle's interior returns page content, not .lm-tri-up. So stop
    // before adopting anything taller than a nav (25% of the viewport), and
    // re-resolve per open() so the measurement matches the current viewport.
    var NAV_MAX_H_FRACTION = 0.25;
    function resolveNavHost(){
      if (!btn) return null;
      var host = btn, cand = btn, cap = NAV_MAX_H_FRACTION * window.innerHeight;
      while (cand.parentElement && cand.parentElement !== document.body){
        cand = cand.parentElement;
        if (cand.getBoundingClientRect().height > cap) break;
        host = cand;
      }
      return host;
    }
    var navHost = null, navPrev = null;
    function raiseNav(){
      if (navPrev) return;
      navHost = resolveNavHost();
      if (!navHost) return;
      navPrev = { z: navHost.style.zIndex, pos: navHost.style.position };
      if (getComputedStyle(navHost).position === 'static') navHost.style.position = 'relative';
      navHost.style.zIndex = '9999';
    }
    function restoreNav(){
      if (!navHost || !navPrev) return;
      navHost.style.zIndex = navPrev.z;
      navHost.style.position = navPrev.pos;
      navPrev = null;
    }

    // Capture the prior inline value rather than resetting to '' — the page may
    // legitimately carry its own inline body overflow (a cookie banner, a
    // ScrollTrigger pin), and blanking it would silently take that over. Same
    // capture/restore contract as raiseNav().
    var scrollPrev = null;
    function lockScroll(){
      if (scrollLocked) return;
      scrollLocked = true;
      scrollPrev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    function unlockScroll(){
      if (!scrollLocked) return;
      scrollLocked = false;
      document.body.style.overflow = scrollPrev === null ? '' : scrollPrev;
      scrollPrev = null;
    }

    function focusable(){
      return root.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
    }

    function onKey(e){
      if (!isOpen) return;
      if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusable();
      if (!f.length) return;
      var first = f[0], last = f[f.length-1];
      // Also catches focus sitting outside the overlay entirely (e.g. on the button).
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))){
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))){
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKey);

    if (btn){
      btn.setAttribute('aria-haspopup','dialog');
      btn.addEventListener('click', function(e){
        e.preventDefault();           // href is "#" — never let it jump
        isOpen ? close() : open();
      });
    }

    // Any link inside the menu closes it. Right now every href is "#", so this is
    // the only thing that makes those links do anything at all.
    root.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('.lm-link');
      if (!a) return;
      // Same guard the button already carries. A bare "#" navigates: it scrolls
      // to the top of the document and pushes a history entry. On this
      // one-pager — with a scroll-pinned card tornado on it — that teleports the
      // reader out of wherever they were and poisons the Back button, every
      // single time the menu is used. Only placeholder hrefs are suppressed;
      // once real hrefs are filled in they navigate normally.
      if (a.getAttribute('href') === '#') e.preventDefault();
      close();
    });

    var isOpen = false;

    function open(){
      if (isOpen) return;
      isOpen = true;
      if (tl) tl.kill();
      tl = buildTimeline();                       // rebuilt so entryVec is current
      root.classList.add('lm-open');
      // buildTimeline()'s first tween (up/lo at position 0) immediate-renders
      // GSAP's off-screen "from" transform the instant it's created, so by
      // this point the panels are already translated off-screen. fitText()
      // must measure the SETTLED layout or availableWidth() reads garbage
      // (an off-screen y clamps t to 1, i.e. "full wedge width", the exact
      // opposite of the real constraint at the panel's true position).
      // Reset to identity for the measurement only; the entry frame is then
      // restored explicitly below (play(0) alone does NOT do it for the lower
      // panel, whose tween starts at 0.06 rather than 0).
      // The content stagger (items, {opacity:0,y:12}->{...}, 0.76) immediate-
      // renders its y:12 "from" state the same way, even though it's
      // positioned at 0.76 rather than 0 -- so the items need the same
      // pre-measurement reset as up/lo, or fitText() measures a rect that's
      // 12px off from where the item will actually settle, eating into the
      // fit margin (measured effect: "Termin buchen" fit to 19.86px instead
      // of 20.99px at 375 -- over-shrinking in the safe direction, but
      // needlessly close to the 16px floor on the tightest item).
      gsap.set([root.querySelector('.lm-tri-up'), root.querySelector('.lm-tri-lo')], { x:0, y:0 });
      gsap.set(root.querySelectorAll('.lm-link, .lm-loc'), { y:0 });
      fitText();                                   // elements must be visible first
      // Restore the entry frame for BOTH panels before playing. play(0) only renders
      // tweens that are ACTIVE at playhead 0, and the lower panel's tween starts at
      // 0.06 -- so without this it keeps the identity transform set above for
      // measurement and paints fully assembled for ~60ms before snapping off-screen.
      // Measured: at t=5.2ms and t=5.8ms (two painted frames) upper was already at
      // (-530,-1563) while lower was still at (0,0). That is the visible flash.
      // Reduced motion legitimately rests at identity, so it is excluded.
      if (!reduced()){
        var ev = entryVec();
        gsap.set(root.querySelector('.lm-tri-up'), { x:-ev.x, y:-ev.y });
        gsap.set(root.querySelector('.lm-tri-lo'), { x: ev.x, y: ev.y });
      }
      tl.timeScale(1).play(0);
      lockScroll();
      raiseNav();
      if (btn) btn.setAttribute('aria-expanded','true');
      var f = focusable();
      if (f.length) f[0].focus();
    }

    function close(){
      if (!isOpen) return;
      isOpen = false;
      unlockScroll();
      restoreNav();
      if (btn){ btn.setAttribute('aria-expanded','false'); btn.focus(); }
      if (!tl) { root.classList.remove('lm-open'); return; }
      tl.timeScale(CFG.closeScale).reverse();
      tl.eventCallback('onReverseComplete', function(){ root.classList.remove('lm-open'); });
    }

    // No resize-time timeline kill: close() sets isOpen=false synchronously,
    // before the reverse tween finishes, so a resize mid-close would see
    // "closed" and kill the in-flight tween — onReverseComplete never fires,
    // lm-open never gets removed, and the full-viewport overlay is stranded
    // visible with pointer-events:auto. open() already does `if (tl) tl.kill();
    // tl = buildTimeline();` on every open, so entryVec() is always current
    // for the live viewport regardless; the resize-time kill was never
    // load-bearing, just an early free that isn't safe to make.

    // Resize: re-fit text to the wedge. It must NEVER kill, rebuild, or
    // otherwise touch the timeline — that was the bug the comment above
    // documents.
    //
    // Gated on isOpen and rAF-throttled. fitText() forces ~11 synchronous
    // layouts per call (a getBoundingClientRect per fitted element, each after
    // a gsap.set write). Running it while CLOSED is pure waste: open() calls
    // fitText() itself, so nothing depends on the closed-state result. And on
    // mobile the URL bar showing/hiding fires a resize STORM during ordinary
    // scrolling — the same scrolling that drives this page's pinned
    // ScrollTrigger — so the unthrottled version paid that cost repeatedly for
    // an overlay nobody had opened.
    var fitRaf = 0;
    window.addEventListener('resize', function(){
      if (!isOpen || fitRaf) return;
      fitRaf = requestAnimationFrame(function(){ fitRaf = 0; fitText(); });
    });

    window.__lmDebug = { open: open, close: close, root: root,
                         entryVec: entryVec, isOpen: function(){ return isOpen; },
                         timeScale: function(){ return tl ? tl.timeScale() : null; },
                         isActive: function(){ return tl ? tl.isActive() : false; },
                         cfg: CFG, fitText: fitText };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
