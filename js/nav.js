/* ManiBoard — D-pad (remote) navigation.
 *
 * Arrow keys move focus to the nearest focusable element in that direction, based on
 * where things actually sit on screen, so new panels/buttons need no wiring.
 * OK/Enter clicks the focused element. Back closes the top layer (modal / photo mode)
 * via the browser history, which is what the remote's Back button triggers on Android TV.
 */
(function () {
  'use strict';

  var SELECTOR = '.focusable, input.input, textarea.input';
  var scope = null;          // when a modal is open, navigation is trapped inside it
  var lastFocused = null;
  var hooks = { key: null, back: null, activity: null };
  var rotation = 0;          // 90 / -90 when the page is rotated for a portrait-mounted TV

  // Element position as the viewer sees it (undoes the page rotation), so ▲ always means "up".
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    if (rotation === 90) {
      var H = window.innerWidth;
      return { left: r.top, right: r.bottom, top: H - r.right, bottom: H - r.left, width: r.height, height: r.width };
    }
    if (rotation === -90) {
      var W = window.innerHeight;
      return { left: W - r.bottom, right: W - r.top, top: r.left, bottom: r.right, width: r.height, height: r.width };
    }
    return r;
  }

  function isVisible(el) {
    if (el.disabled) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el.closest('[hidden], .nav-off')) return false;
    return true;
  }

  function scrollerOf(el) { return el.closest('.scroll, .sheet'); }

  // Elements scrolled out of view inside a list may only be reached from inside that same list.
  function reachable(el, cur) {
    var sc = scrollerOf(el);
    if (!sc) return true;
    if (cur && scrollerOf(cur) === sc) return true;
    var r = rectOf(el), s = rectOf(sc);
    return r.bottom > s.top + 4 && r.top < s.bottom - 4;
  }

  function candidates(cur) {
    var root = scope || document;
    var all = root.querySelectorAll(SELECTOR), out = [];
    for (var i = 0; i < all.length; i++) {
      if (isVisible(all[i]) && reachable(all[i], cur)) out.push(all[i]);
    }
    return out;
  }

  function gap(a1, a2, b1, b2) {
    if (b2 < a1) return a1 - b2;
    if (b1 > a2) return b1 - a2;
    return 0;
  }

  function score(a, b, dir) {
    var acx = (a.left + a.right) / 2, acy = (a.top + a.bottom) / 2;
    var bcx = (b.left + b.right) / 2, bcy = (b.top + b.bottom) / 2;
    var main, cross, drift;
    if (dir === 'right') {
      if (bcx <= acx + 1 || b.right <= a.right - 1) return null;
      main = Math.max(0, b.left - a.right); cross = gap(a.top, a.bottom, b.top, b.bottom); drift = Math.abs(bcy - acy);
    } else if (dir === 'left') {
      if (bcx >= acx - 1 || b.left >= a.left + 1) return null;
      main = Math.max(0, a.left - b.right); cross = gap(a.top, a.bottom, b.top, b.bottom); drift = Math.abs(bcy - acy);
    } else if (dir === 'down') {
      if (bcy <= acy + 1 || b.bottom <= a.bottom - 1) return null;
      main = Math.max(0, b.top - a.bottom); cross = gap(a.left, a.right, b.left, b.right); drift = Math.abs(bcx - acx);
    } else {
      if (bcy >= acy - 1 || b.top >= a.top + 1) return null;
      main = Math.max(0, a.top - b.bottom); cross = gap(a.left, a.right, b.left, b.right); drift = Math.abs(bcx - acx);
    }
    return main + cross * 2.5 + drift * 0.08;
  }

  function scrollIntoList(el) {
    var sc = scrollerOf(el);
    if (!sc) return;
    var r = rectOf(el), s = rectOf(sc);
    var pad = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3;
    var delta = 0;
    if (r.top < s.top + pad) delta = r.top - s.top - pad;
    else if (r.bottom > s.bottom - pad) delta = r.bottom - s.bottom + pad;
    if (delta) {
      if (sc.scrollBy) sc.scrollBy({ top: delta, behavior: 'smooth' });
      else sc.scrollTop += delta;
    }
  }

  function focus(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    scrollIntoList(el);
    lastFocused = el;
    return true;
  }

  function current() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    if (scope && !scope.contains(a)) return null;
    return a;
  }

  function focusDefault() {
    if (!scope && lastFocused && document.contains(lastFocused) && isVisible(lastFocused)) return focus(lastFocused);
    var list = candidates(null);
    var pref = (scope || document).querySelector('[data-autofocus]');
    if (pref && isVisible(pref)) return focus(pref);
    return focus(list[0]);
  }

  function move(dir) {
    var cur = current();
    if (!cur) return focusDefault();
    var a = rectOf(cur);
    var list = candidates(cur), best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === cur) continue;
      var s = score(a, rectOf(list[i]), dir);
      if (s !== null && s < bestScore) { best = list[i]; bestScore = s; }
    }
    return best ? focus(best) : false;
  }

  // Date / time boxes use the device's own picker: OK opens it, arrows move between fields.
  function isPickerField(el) {
    return !!el && el.tagName === 'INPUT' && /^(date|time|datetime-local|month|week)$/i.test(el.type);
  }
  function openPicker(el) {
    try { if (el.showPicker) { el.showPicker(); return; } } catch (e) { /* not allowed here */ }
    el.focus(); el.click();
  }

  function isTextField(el) {
    return !!el && !isPickerField(el) &&
      (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|range)$/i.test(el.type)));
  }
  var touchMode = false; // phones: normal keyboard behaviour, no remote tricks

  // ---- On-screen keyboard control -----------------------------------------------
  // On Android TV, focusing a text box pops up a full-screen keyboard that hides the page.
  // So text boxes start with inputmode="none" (no keyboard): arrowing onto one only highlights
  // it, and pressing OK on it brings the keyboard up.
  function prepInputs(root) {
    if (touchMode) return;
    var els = (root || document).querySelectorAll('input.input, textarea.input');
    for (var i = 0; i < els.length; i++) {
      if (isPickerField(els[i])) continue;
      var el = els[i];
      if (!el.hasAttribute('data-im')) el.setAttribute('data-im', el.getAttribute('inputmode') || 'text');
      el.setAttribute('inputmode', 'none');
    }
  }
  function openKeyboard(el) {
    if (el.getAttribute('inputmode') !== 'none') return false; // keyboard already allowed
    el.blur(); // (this also resets inputmode to none via the focusout handler below)
    el.setAttribute('inputmode', el.getAttribute('data-im') || 'text');
    // Re-focus a moment later: on Android TV an instant blur+focus counts as "nothing
    // happened" and the keyboard never appears.
    setTimeout(function () {
      el.focus();
      try { var n = el.value.length; el.setSelectionRange(n, n); } catch (e) { /* not supported */ }
    }, 80);
    return true;
  }
  // Leaving a text box switches its keyboard off again.
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('input') && t.hasAttribute('data-im')) t.setAttribute('inputmode', 'none');
  }, true);
  // Tapping a text box (touch screens, mouse) should still open the keyboard.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('input') && t.getAttribute('inputmode') === 'none') openKeyboard(t);
  });

  var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Up: 'up', Down: 'down', Left: 'left', Right: 'right' };
  var CODES = { 38: 'up', 40: 'down', 37: 'left', 39: 'right', 19: 'up', 20: 'down', 21: 'left', 22: 'right' };

  document.addEventListener('keydown', function (e) {
    var dir = DIRS[e.key] || CODES[e.keyCode];
    var t = document.activeElement;
    var text = isTextField(t);
    if (hooks.activity) hooks.activity();
    // Every OK press can be followed by an echo tap (Fully Kiosk) — swallow it, even when the
    // page handled the key itself (e.g. OK leaving photo mode), or it clicks whatever is
    // highlighted next, like the Photo mode button.
    if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66) lastKeyActivate = Date.now();

    if (hooks.key && hooks.key(e, dir) === true) { e.preventDefault(); return; }

    if (dir) {
      if (text && (dir === 'left' || dir === 'right')) {
        var len = t.value.length, s = t.selectionStart, en = t.selectionEnd;
        if (dir === 'left' && !(s === 0 && en === 0)) return;     // let the caret move
        if (dir === 'right' && !(s === len && en === len)) return;
      }
      e.preventDefault();
      move(dir);
      return;
    }

    var isEnter = e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66;
    if (isEnter && isPickerField(t)) {
      e.preventDefault();
      if (!e.repeat) openPicker(t);
      return;
    }
    if (isEnter) {
      if (text) {
        // First OK on a text box opens the keyboard; after typing, Enter is handled by the page.
        if (!e.repeat && openKeyboard(t)) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      e.preventDefault();
      if (e.repeat) return;
      var c = current();
      lastKeyActivate = Date.now();
      if (c && c.click) c.click(); else focusDefault();
      return;
    }

    var isBack = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 27 || e.keyCode === 4 ||
                 (e.key === 'Backspace' && !text);
    if (isBack && hooks.back && hooks.back()) e.preventDefault();
  }, true);

  // Some Android TV WebViews (Fully Kiosk) turn the remote's OK button into a key press AND a
  // fake tap at the same spot. We already acted on the key press, so swallow that echo tap —
  // otherwise it lands on whatever just opened (e.g. a dialog's backdrop) and closes it again.
  var lastKeyActivate = 0;
  function swallowEcho(e) {
    if (e.isTrusted && Date.now() - lastKeyActivate < 700) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  }
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(function (t) {
    window.addEventListener(t, swallowEcho, { capture: true, passive: false });
  });

  // Mouse / pointer-cursor browsers: keep focus in sync with what was clicked.
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest && e.target.closest(SELECTOR);
    if (el) lastFocused = el;
    if (hooks.activity) hooks.activity();
  });

  window.Nav = {
    focus: focus,
    focusDefault: focusDefault,
    move: move,
    setScope: function (el) { scope = el || null; },
    setRotation: function (deg) { rotation = deg || 0; },
    prepInputs: prepInputs,
    setTouchMode: function (on) { touchMode = !!on; },
    getScope: function () { return scope; },
    forget: function () { lastFocused = null; },
    blur: function () {
      var a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    },
    on: function (name, fn) { hooks[name] = fn; }
  };
})();
