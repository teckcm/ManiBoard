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

  function isVisible(el) {
    if (el.disabled) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el.closest('[hidden], .nav-off')) return false;
    return true;
  }

  function scrollerOf(el) { return el.closest('.scroll'); }

  // Elements scrolled out of view inside a list may only be reached from inside that same list.
  function reachable(el, cur) {
    var sc = scrollerOf(el);
    if (!sc) return true;
    if (cur && scrollerOf(cur) === sc) return true;
    var r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
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
    var r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
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
    var a = cur.getBoundingClientRect();
    var list = candidates(cur), best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === cur) continue;
      var s = score(a, list[i].getBoundingClientRect(), dir);
      if (s !== null && s < bestScore) { best = list[i]; bestScore = s; }
    }
    return best ? focus(best) : false;
  }

  function isTextField(el) {
    return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|range)$/i.test(el.type)));
  }

  var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Up: 'up', Down: 'down', Left: 'left', Right: 'right' };
  var CODES = { 38: 'up', 40: 'down', 37: 'left', 39: 'right', 19: 'up', 20: 'down', 21: 'left', 22: 'right' };

  document.addEventListener('keydown', function (e) {
    var dir = DIRS[e.key] || CODES[e.keyCode];
    var t = document.activeElement;
    var text = isTextField(t);
    if (hooks.activity) hooks.activity();

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
    if (isEnter) {
      if (text) return; // forms handle their own submit
      e.preventDefault();
      if (e.repeat) return;
      var c = current();
      if (c && c.click) c.click(); else focusDefault();
      return;
    }

    var isBack = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 27 || e.keyCode === 4 ||
                 (e.key === 'Backspace' && !text);
    if (isBack && hooks.back && hooks.back()) e.preventDefault();
  }, true);

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
    getScope: function () { return scope; },
    forget: function () { lastFocused = null; },
    blur: function () {
      var a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    },
    on: function (name, fn) { hooks[name] = fn; }
  };
})();
