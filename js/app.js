/* ManiBoard — home dashboard for Android TV boxes (Mi Box 4K etc.)
 * Data comes from your own Google Apps Script (see apps-script/Code.gs):
 *   Google Calendar events, Google Tasks, and photos from a shared Google Photos album.
 * Without a backend it still works: the to-do list is saved on the TV itself.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ basics
  var LS = { settings: 'mb.settings', todos: 'mb.todos', cache: 'mb.cache', photos: 'mb.photos', geo: 'mb.geo', weather: 'mb.weather' };
  var DEMO = /[?&]demo=1\b/.test(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;

  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function safeColor(c) { return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#f5b94a'; }

  importSetupFromHash();
  var settings = Object.assign({}, window.MANIBOARD_CONFIG || {}, lsGet(LS.settings, {}));
  settings.slideSeconds = clamp(+settings.slideSeconds || 30, 5, 3600);
  settings.calendarDays = clamp(+settings.calendarDays || 14, 1, 60);
  settings.refreshMinutes = settings.refreshMinutes || { dashboard: 3, photos: 360, weather: 30 };

  function mode() { return DEMO ? 'demo' : (settings.apiUrl && settings.apiKey ? 'google' : 'local'); }

  function fmtTime(d) {
    var h = d.getHours(), m = d.getMinutes();
    if (settings.use24h) return pad(h) + ':' + pad(m);
    return ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // ---- Screen orientation --------------------------------------------------
  // Android TV always outputs landscape, so for a TV mounted on its side the whole page
  // (#stage) is rotated 90°. 'portrait-cw' / 'portrait-ccw' pick the direction.
  var ROT = 0, stage = $('stage');
  function logicalSize() {
    return ROT ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight };
  }
  // Root font size follows the screen; portrait uses 1rem = width/67.5, landscape width/120.
  // Height-only shrinks are ignored (that's the on-screen keyboard opening).
  var lastW = 0, lastH = 0;
  function applyOrientation(force) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!force && vw === lastW && vh < lastH) return;
    lastW = vw; lastH = vh;
    var o = settings.orientation;
    ROT = o === 'portrait-cw' ? 90 : o === 'portrait-ccw' ? -90 : 0;
    body.classList.toggle('rot-cw', ROT === 90);
    body.classList.toggle('rot-ccw', ROT === -90);
    var L = logicalSize();
    stage.style.width = ROT ? L.w + 'px' : '';
    stage.style.height = ROT ? L.h + 'px' : '';
    var portrait = L.h > L.w;
    body.classList.toggle('portrait', portrait);
    document.documentElement.style.fontSize = (portrait ? Math.min(L.w / 67.5, L.h / 120) : Math.min(L.w / 120, L.h / 67.5)) + 'px';
    Nav.setRotation(ROT);
  }
  applyOrientation(true);
  window.addEventListener('resize', function () { applyOrientation(false); });

  // ------------------------------------------------------------------ icons
  var ICONS = {
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    next: '<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    cloudSun: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    rain: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v6M8 14v6M12 16v6"/>',
    snow: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
    storm: '<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"/><path d="m13 12-3 5h4l-3 5"/>',
    fog: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 17H7M17 21H9"/>'
  };
  function icon(name) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  function fillIcons(root) {
    var els = (root || document).querySelectorAll('[data-icon]');
    for (var i = 0; i < els.length; i++) els[i].outerHTML = icon(els[i].getAttribute('data-icon'));
  }
  fillIcons();

  // ------------------------------------------------------------------ toast / status
  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function setStatus(text, isErr) {
    var s = $('status');
    s.textContent = text || '';
    s.classList.toggle('err', !!isErr);
  }

  // ------------------------------------------------------------------ layers (modal / photo mode) + Back button
  // Each layer pushes a history entry, so the remote's Back button (browser "back") closes it.
  var layers = [];
  function pushLayer(name, onClose) {
    layers.push({ name: name, onClose: onClose });
    try { history.pushState({ mb: name }, ''); } catch (e) { /* ignore */ }
  }
  function closeTop() {
    var top = layers[layers.length - 1];
    if (!top) return;
    try { history.back(); } catch (e) { /* ignore */ }
    setTimeout(function () { // fallback if popstate never fires
      if (layers[layers.length - 1] === top) { layers.pop(); top.onClose(); }
    }, 450);
  }
  window.addEventListener('popstate', function () {
    var top = layers.pop();
    if (top) top.onClose();
  });
  Nav.on('back', function () {
    if (layers.length) { closeTop(); return true; }
    return false;
  });

  var modal = $('modal'), sheet = $('sheet'), modalReturnFocus = null;
  function openModal(html) {
    var wasOpen = !modal.hidden;
    sheet.innerHTML = html;
    fillIcons(sheet);
    if (!wasOpen) {
      modalReturnFocus = document.activeElement;
      modal.hidden = false;
      Nav.setScope(sheet);
      pushLayer('modal', function () {
        modal.hidden = true;
        sheet.innerHTML = '';
        Nav.setScope(null);
        if (modalReturnFocus && document.contains(modalReturnFocus)) Nav.focus(modalReturnFocus);
        if (pendingTodoRender) renderTodos();
      });
    }
    setTimeout(function () { Nav.focusDefault(); }, 40);
  }
  function closeModal() { if (!modal.hidden) closeTop(); }
  modal.addEventListener('mousedown', function (e) { if (e.target === modal) closeModal(); });

  // ------------------------------------------------------------------ clock, greeting, night dim
  var lastMinuteKey = '', lastDayKey = '', undimUntil = 0;
  function tick(force) {
    var d = new Date();
    var key = d.getHours() + ':' + d.getMinutes();
    if (!force && key === lastMinuteKey) return;
    lastMinuteKey = key;

    var h = d.getHours(), m = d.getMinutes();
    $('clockTime').textContent = settings.use24h ? pad(h) + ':' + pad(m) : ((h % 12) || 12) + ':' + pad(m);
    $('clockAmPm').textContent = settings.use24h ? '' : (h < 12 ? 'AM' : 'PM');
    var dateText = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('clockDate').textContent = dateText;
    $('greeting').textContent = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
    $('miniClock').innerHTML = esc(fmtTime(d)) + '<small>' + esc(dateText) + '</small>';
    applyNightDim(d);

    var dayKey = ymd(d);
    if (lastDayKey && dayKey !== lastDayKey) loadDashboard(); // new day → new agenda window
    lastDayKey = dayKey;
    renderCalendar(); // drops finished events, updates "Now"
  }
  function applyNightDim(d) {
    var nd = settings.nightDim || {}, on = false;
    if (nd.enabled && Date.now() > undimUntil) {
      var h = d.getHours();
      on = nd.from > nd.to ? (h >= nd.from || h < nd.to) : (h >= nd.from && h < nd.to);
    }
    $('nightDim').style.opacity = on ? (nd.opacity || 0.6) : 0;
  }

  // ------------------------------------------------------------------ network
  function fetchJson(url, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 20000);
    return fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function () {
          throw new Error('Backend did not return data — check the deployment is shared with "Anyone"');
        });
      }, function (e) {
        clearTimeout(timer);
        throw new Error(e && e.name === 'AbortError' ? 'Request timed out' : 'Can’t reach the backend');
      });
  }

  function api(action, params) {
    var url = String(settings.apiUrl).trim();
    var q = ['action=' + encodeURIComponent(action), 'key=' + encodeURIComponent(settings.apiKey), '_=' + Date.now()];
    params = params || {};
    for (var k in params) {
      if (params.hasOwnProperty(k) && params[k] !== undefined && params[k] !== null) q.push(k + '=' + encodeURIComponent(params[k]));
    }
    return fetchJson(url + (url.indexOf('?') < 0 ? '?' : '&') + q.join('&'), 30000).then(function (j) {
      if (j && j.error) throw new Error(j.error);
      return j;
    });
  }

  // Setup link: https://you.github.io/ManiBoard/#api=<exec url>&key=<key>&city=<city>
  function importSetupFromHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    var p = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) { try { p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* bad encoding */ } }
    });
    if (!p.api && !p.key && !p.city && !p.rotate) return;
    var o = lsGet(LS.settings, {});
    if (p.api) o.apiUrl = p.api;
    if (p.key) o.apiKey = p.key;
    if (p.city) o.weatherCity = p.city;
    if (p.rotate) o.orientation = p.rotate === 'cw' ? 'portrait-cw' : p.rotate === 'ccw' ? 'portrait-ccw' : 'landscape';
    lsSet(LS.settings, o);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    setTimeout(function () { toast('Setup saved on this TV'); }, 600);
  }

  // ------------------------------------------------------------------ dashboard data (calendar + tasks)
  var state = { events: [], tasks: [], updated: null, errShown: false, demoLoaded: false };

  function loadDashboard() {
    var m = mode();
    if (m === 'demo') {
      if (!state.demoLoaded) { var d = demoData(); state.events = d.events; state.tasks = d.tasks; state.demoLoaded = true; }
      renderCalendar(); renderTodos(); setStatus('Demo mode');
      return Promise.resolve();
    }
    if (m === 'local') {
      renderCalendar(); renderTodos(); setStatus('Not connected · open Settings');
      return Promise.resolve();
    }
    if (!state.updated) setStatus('Loading…');
    return api('dashboard', { from: startOfDay(new Date()).toISOString(), days: settings.calendarDays })
      .then(function (j) {
        state.updated = new Date();
        state.events = j.events || [];
        state.tasks = j.tasks || [];
        lsSet(LS.cache, { events: state.events, tasks: state.tasks, at: Date.now(), api: settings.apiUrl });
        renderCalendar(); renderTodos();
        if (j.errors && j.errors.length) {
          setStatus(j.errors[0], true);
          if (!state.errShown) { state.errShown = true; toast(j.errors[0], 7000); }
        } else {
          setStatus('Updated ' + fmtTime(state.updated));
        }
      })
      .catch(function (err) {
        setStatus(state.updated ? 'Offline · last update ' + fmtTime(state.updated) : err.message, true);
      });
  }

  function restoreCache() {
    if (mode() !== 'google') return;
    var c = lsGet(LS.cache, null);
    if (c && c.api === settings.apiUrl) {
      state.events = c.events || [];
      state.tasks = c.tasks || [];
      state.updated = new Date(c.at);
    }
  }

  // Re-render a list without losing the remote's focus or scroll position.
  function rerender(container, html) {
    var a = document.activeElement, key = null;
    if (a && container.contains(a)) key = a.getAttribute('data-key');
    var top = container.scrollTop;
    container.innerHTML = html;
    fillIcons(container);
    container.scrollTop = top;
    if (key !== null) {
      var els = container.querySelectorAll('[data-key]'), target = null;
      for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-key') === key) { target = els[i]; break; }
      Nav.focus(target || container.querySelector('.focusable'));
    }
  }

  // ------------------------------------------------------------------ calendar
  function dayLabel(d, i) {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  function buildAgenda() {
    var now = new Date(), today = startOfDay(now), days = settings.calendarDays, buckets = [];
    for (var i = 0; i < days; i++) buckets.push({ date: addDays(today, i), items: [] });
    state.events.forEach(function (ev, idx) {
      if (ev.allDay) {
        var s = parseYmd(ev.startDate), e = parseYmd(ev.endDate || ev.startDate);
        if (e <= s) e = addDays(s, 1);
        for (var j = 0; j < days; j++) {
          var d = buckets[j].date;
          if (d >= s && d < e) buckets[j].items.push({ ev: ev, idx: idx, sort: -1 });
        }
      } else {
        var st = new Date(ev.start), en = new Date(ev.end);
        if (isNaN(st) || en <= now) return; // finished → hide
        var di = Math.round((startOfDay(st) - today) / 864e5);
        if (di < 0) di = 0;
        if (di >= days) return;
        buckets[di].items.push({ ev: ev, idx: idx, sort: st.getTime(), now: st <= now && en > now });
      }
    });
    buckets.forEach(function (b) { b.items.sort(function (a, c) { return a.sort - c.sort; }); });
    return buckets;
  }

  function renderCalendar() {
    var el = $('calList'), m = mode();
    if (m === 'local') {
      $('calSub').textContent = '';
      rerender(el,
        '<div class="empty"><strong>Connect your Google account</strong>' +
        'Your Google Calendar, Google Tasks and Google Photos show up here once the Apps Script backend is connected.' +
        '<br><button class="btn focusable" data-action="settings" data-key="setup">' + icon('sliders') + 'Open Settings</button></div>');
      return;
    }
    var buckets = buildAgenda(), html = '';
    buckets.forEach(function (b, i) {
      if (!b.items.length && i > 0) return;
      html += '<div class="day-label' + (i === 0 ? ' today' : '') + '">' + esc(dayLabel(b.date, i)) + '</div>';
      if (!b.items.length) html += '<div class="empty">Nothing else on today.</div>';
      b.items.forEach(function (it) {
        var ev = it.ev, time;
        if (ev.allDay) time = 'All day';
        else if (it.now) time = 'Now<small>until ' + esc(fmtTime(new Date(ev.end)).replace(/ (AM|PM)$/, '')) + '</small>';
        else time = esc(fmtTime(new Date(ev.start))) + '<small>' + esc(fmtTime(new Date(ev.end))) + '</small>';
        var meta = [ev.location, ev.calendar].filter(Boolean).join(' · ');
        html += '<div class="event focusable' + (it.now ? ' now' : '') + '" tabindex="0" data-action="event" data-idx="' + it.idx + '"' +
          ' data-key="ev:' + esc(ev.id) + ':' + i + '" style="--c:' + safeColor(ev.color) + '">' +
          '<div class="ev-time">' + time + '</div><div class="ev-bar"></div>' +
          '<div class="ev-main"><div class="ev-title">' + esc(ev.title) + '</div>' +
          (meta ? '<div class="ev-meta">' + esc(meta) + '</div>' : '') + '</div></div>';
      });
    });
    var todayCount = buckets[0] ? buckets[0].items.length : 0;
    $('calSub').textContent = todayCount ? todayCount + ' today' : 'Free today';
    rerender(el, html);
  }

  function openEvent(idx) {
    var ev = state.events[idx];
    if (!ev) return;
    var when;
    if (ev.allDay) {
      var s = parseYmd(ev.startDate), e = addDays(parseYmd(ev.endDate || ev.startDate), -1);
      var o = { weekday: 'long', day: 'numeric', month: 'long' };
      when = s.toLocaleDateString(undefined, o) + (e > s ? ' – ' + e.toLocaleDateString(undefined, o) : '') + ' · All day';
    } else {
      var st = new Date(ev.start), en = new Date(ev.end);
      when = st.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + fmtTime(st) + ' – ' +
        (ymd(st) === ymd(en) ? '' : en.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ') + fmtTime(en);
    }
    openModal(
      '<h3>' + esc(ev.title) + '</h3>' +
      '<div class="detail-line">' + icon('clock') + esc(when) + '</div>' +
      (ev.location ? '<div class="detail-line">' + icon('pin') + esc(ev.location) + '</div>' : '') +
      (ev.calendar ? '<div class="detail-line"><span style="color:' + safeColor(ev.color) + '">' + icon('calendar') + '</span>' + esc(ev.calendar) + '</div>' : '') +
      (ev.description ? '<p class="body-text">' + esc(ev.description) + '</p>' : '') +
      '<div class="btn-row"><button class="btn primary focusable" data-action="close" data-autofocus>Close</button></div>');
  }

  // ------------------------------------------------------------------ to-do
  var localTodos = lsGet(LS.todos, []);
  var pendingTodoRender = false;

  function todos() { return mode() === 'local' ? localTodos : state.tasks; }
  function saveLocal() { lsSet(LS.todos, localTodos); }

  function visibleTodos() {
    var cutoff = Date.now() - 24 * 3600e3;
    if (mode() === 'local') {
      var before = localTodos.length;
      localTodos = localTodos.filter(function (t) { return !t.done || !t.completed || new Date(t.completed).getTime() > cutoff; });
      if (localTodos.length !== before) saveLocal();
    }
    return todos().filter(function (t) {
      return !t.done || !t.completed || new Date(t.completed).getTime() > cutoff;
    }).sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.done) return (b.completed || '') > (a.completed || '') ? 1 : -1;
      var ad = a.due || '9999', bd = b.due || '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      var ap = a.position || a.created || '', bp = b.position || b.created || '';
      return ap < bp ? -1 : ap > bp ? 1 : 0;
    });
  }

  function dueLabel(due) {
    if (!due) return '';
    var today = ymd(new Date()), tomorrow = ymd(addDays(new Date(), 1));
    if (due < today) return '<span class="todo-due overdue">Overdue</span>';
    if (due === today) return '<span class="todo-due">Today</span>';
    if (due === tomorrow) return '<span class="todo-due">Tomorrow</span>';
    return '<span class="todo-due">' + esc(parseYmd(due).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + '</span>';
  }

  function updateTodoSub() {
    var left = todos().filter(function (t) { return !t.done; }).length;
    $('todoSub').textContent = (left ? left + ' left' : 'All done') + (mode() === 'local' ? ' · saved on this TV' : '');
  }

  function renderTodos(force) {
    var el = $('todoList');
    // Don't reshuffle the list under the user's focus — wait until they leave it.
    if (!force && el.contains(document.activeElement)) { pendingTodoRender = true; updateTodoSub(); return; }
    pendingTodoRender = false;
    var list = visibleTodos(), html = '';
    if (!list.length) {
      html = '<div class="empty"><strong>All clear</strong>Nothing on the list. Choose <em>Add task</em>' +
        (mode() === 'google' ? ', or add one in Google Tasks on your phone.' : ' to add one.') + '</div>';
    }
    list.forEach(function (t) {
      html += '<div class="todo-row">' +
        '<button class="todo focusable' + (t.done ? ' done' : '') + '" data-action="toggle" data-id="' + esc(t.id) + '" data-key="t:' + esc(t.id) + '">' +
        '<span class="check">' + icon('check') + '</span><span class="todo-title">' + esc(t.title) + '</span>' + (t.done ? '' : dueLabel(t.due)) + '</button>' +
        '<button class="todo-del focusable" data-action="delete" data-id="' + esc(t.id) + '" data-key="d:' + esc(t.id) + '" aria-label="Delete">' + icon('x') + '</button>' +
        '</div>';
    });
    rerender(el, html);
    updateTodoSub();
  }

  document.addEventListener('focusin', function (e) {
    if (pendingTodoRender && !$('todoList').contains(e.target)) renderTodos();
  });

  function findTodo(id) {
    var l = todos();
    for (var i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i];
    return null;
  }

  function toggleTodo(btn) {
    var t = findTodo(btn.getAttribute('data-id'));
    if (!t) return;
    t.done = !t.done;
    t.completed = t.done ? new Date().toISOString() : '';
    btn.classList.toggle('done', t.done); // update in place, list re-sorts once focus leaves
    var due = btn.querySelector('.todo-due');
    if (due) due.style.display = t.done ? 'none' : '';
    updateTodoSub();
    pendingTodoRender = true;
    var m = mode();
    if (m === 'local') { saveLocal(); return; }
    if (m === 'demo') return;
    api('task.toggle', { id: t.id, done: t.done ? 1 : 0 })
      .then(function (j) { if (j.tasks) { state.tasks = j.tasks; renderTodos(); } })
      .catch(function (err) {
        t.done = !t.done;
        renderTodos(true);
        toast('Couldn’t update task — ' + err.message, 5000);
      });
  }

  var armedTimer;
  function deleteTodo(btn) {
    if (!btn.classList.contains('armed')) { // first press arms, second press deletes
      btn.classList.add('armed');
      btn.innerHTML = icon('x') + 'Delete?';
      clearTimeout(armedTimer);
      armedTimer = setTimeout(function () {
        if (document.contains(btn)) { btn.classList.remove('armed'); btn.innerHTML = icon('x'); }
      }, 3500);
      return;
    }
    var id = btn.getAttribute('data-id'), m = mode();
    var row = btn.closest('.todo-row');
    var next = row && (row.nextElementSibling || row.previousElementSibling);
    if (next) Nav.focus(next.querySelector('.todo'));
    else Nav.focus(document.querySelector('.add-btn'));
    if (m === 'local') {
      localTodos = localTodos.filter(function (t) { return String(t.id) !== id; });
      saveLocal(); renderTodos(true); return;
    }
    var backup = state.tasks.slice();
    state.tasks = state.tasks.filter(function (t) { return String(t.id) !== id; });
    renderTodos(true);
    if (m === 'demo') return;
    api('task.delete', { id: id })
      .then(function (j) { if (j.tasks) { state.tasks = j.tasks; renderTodos(); } })
      .catch(function (err) { state.tasks = backup; renderTodos(true); toast('Couldn’t delete — ' + err.message, 5000); });
  }

  function openAddTask() {
    openModal(
      '<h3>New task</h3>' +
      '<p class="lead">Press OK on the box to bring up the keyboard. Typing is easier from your phone with the Google TV app’s keyboard' +
      (mode() === 'google' ? ', or add tasks straight in Google Tasks.' : '.') + '</p>' +
      '<form id="taskForm" autocomplete="off" onsubmit="return false">' +
      '<label class="field"><span>Task</span><input class="input" id="taskTitle" name="taskTitle" maxlength="200" placeholder="e.g. Buy milk" data-autofocus></label>' +
      '<label class="field"><span>Due</span></label>' +
      '<div class="seg" style="margin-bottom:1.3rem">' +
      '<button type="button" class="btn focusable" data-action="seg" data-name="due" data-val="" aria-pressed="true">No date</button>' +
      '<button type="button" class="btn focusable" data-action="seg" data-name="due" data-val="' + ymd(new Date()) + '" aria-pressed="false">Today</button>' +
      '<button type="button" class="btn focusable" data-action="seg" data-name="due" data-val="' + ymd(addDays(new Date(), 1)) + '" aria-pressed="false">Tomorrow</button>' +
      '</div>' +
      '<div class="btn-row"><button type="button" class="btn focusable" data-action="close">Cancel</button>' +
      '<button type="button" class="btn primary focusable" data-action="submit-task">' + icon('plus') + 'Add task</button></div>' +
      '</form>');
  }

  function segValue(name) {
    var b = sheet.querySelector('[data-action="seg"][data-name="' + name + '"][aria-pressed="true"]');
    return b ? b.getAttribute('data-val') : '';
  }

  function submitTask() {
    var input = $('taskTitle');
    var title = input ? input.value.trim() : '';
    if (!title) { toast('Type a task first'); if (input) Nav.focus(input); return; }
    var due = segValue('due');
    closeModal();
    var m = mode();
    if (m === 'local') {
      localTodos.push({ id: 'l' + Date.now(), title: title, done: false, due: due, created: new Date().toISOString() });
      saveLocal(); renderTodos(true); toast('Task added');
      return;
    }
    var temp = { id: 'tmp' + Date.now(), title: title, done: false, due: due, position: '99999999999999999999' };
    state.tasks.push(temp);
    renderTodos(true);
    toast('Task added');
    if (m === 'demo') return;
    api('task.add', { title: title, due: due })
      .then(function (j) { if (j.tasks) { state.tasks = j.tasks; renderTodos(); } })
      .catch(function (err) {
        state.tasks = state.tasks.filter(function (t) { return t !== temp; });
        renderTodos(true);
        toast('Couldn’t add task — ' + err.message, 5000);
      });
  }

  // Enter inside a text box: only acts once the user has actually typed something,
  // because on Android TV the OK button on a text box is what opens the keyboard.
  document.addEventListener('input', function (e) { e.target._edited = true; });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!(e.key === 'Enter' || e.keyCode === 13) || !t || !t.classList || !t.classList.contains('input')) return;
    if (!t._edited) return;
    e.preventDefault();
    t._edited = false;
    if (t.id === 'taskTitle') submitTask(); else Nav.move('down');
  });

  // ------------------------------------------------------------------ settings
  function seg(name, options, current) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button type="button" class="btn focusable" data-action="seg" data-name="' + name + '" data-val="' + o[0] + '" aria-pressed="' + (String(current) === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function openSettings() {
    openModal(
      '<h3>Settings</h3>' +
      '<p class="lead">Saved on this TV only. To type, press OK on a field — or use the keyboard in the Google TV app on your phone.</p>' +
      '<form id="settingsForm" autocomplete="off" onsubmit="return false">' +
      '<label class="field"><span>Apps Script URL</span><input class="input" name="apiUrl" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(settings.apiUrl || '') + '" data-autofocus></label>' +
      '<div class="grid2">' +
      '<label class="field"><span>Key</span><input class="input" name="apiKey" spellcheck="false" value="' + esc(settings.apiKey || '') + '"></label>' +
      '<label class="field"><span>Weather city</span><input class="input" name="weatherCity" placeholder="e.g. London" value="' + esc(settings.weatherCity || '') + '"></label>' +
      '<label class="field"><span>Seconds per photo</span><input class="input" name="slideSeconds" inputmode="numeric" value="' + esc(settings.slideSeconds) + '"></label>' +
      '<div class="field"><span>Clock</span>' + seg('use24h', [['0', '12-hour'], ['1', '24-hour']], settings.use24h ? '1' : '0') + '</div>' +
      '<div class="field"><span>Temperature</span>' + seg('tempUnit', [['celsius', '°C'], ['fahrenheit', '°F']], settings.tempUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius') + '</div>' +
      '<div class="field"><span>Photo zoom</span>' + seg('kenBurns', [['1', 'On'], ['0', 'Off']], settings.kenBurns === false ? '0' : '1') + '</div>' +
      '</div>' +
      '<div class="field"><span>Screen</span>' + seg('orientation',
        [['landscape', 'Landscape'], ['portrait-cw', 'Portrait ↻'], ['portrait-ccw', 'Portrait ↺']],
        settings.orientation === 'portrait-cw' || settings.orientation === 'portrait-ccw' ? settings.orientation : 'landscape') +
      '<div class="hint">For a TV on its side. Upside down? Pick the other portrait option.</div></div>' +
      '<div class="field"><span>Auto photo mode</span>' + seg('autoPhotoMinutes', autoPhotoOptions(), String(+settings.autoPhotoMinutes || 0)) +
      '<div class="hint">After this long with no button pressed. Any button brings the dashboard back.</div></div>' +
      '<div class="btn-row"><button type="button" class="btn focusable" data-action="close">Cancel</button>' +
      '<button type="button" class="btn primary focusable" data-action="save-settings">Save</button></div>' +
      '</form>');
  }

  function autoPhotoOptions() {
    var opts = [['0', 'Off'], ['2', '2 min'], ['5', '5 min'], ['15', '15 min'], ['30', '30 min']];
    var cur = String(+settings.autoPhotoMinutes || 0);
    var known = opts.some(function (o) { return o[0] === cur; });
    if (!known) opts.push([cur, cur + ' min']); // a custom value set in config.js
    return opts;
  }

  function saveSettings() {
    var f = $('settingsForm');
    var val = function (n) { return f.elements[n].value.trim(); };
    var next = {
      apiUrl: val('apiUrl'),
      apiKey: val('apiKey'),
      weatherCity: val('weatherCity'),
      slideSeconds: clamp(parseInt(val('slideSeconds'), 10) || 30, 5, 3600),
      use24h: segValue('use24h') === '1',
      tempUnit: segValue('tempUnit') || 'celsius',
      kenBurns: segValue('kenBurns') !== '0',
      orientation: segValue('orientation') || 'landscape',
      autoPhotoMinutes: Math.max(0, parseInt(segValue('autoPhotoMinutes'), 10) || 0)
    };
    var rotChanged = next.orientation !== (settings.orientation || 'landscape');
    if (next.apiUrl && !/^https:\/\//i.test(next.apiUrl)) { toast('The Apps Script URL should start with https://'); return; }
    var apiChanged = next.apiUrl !== settings.apiUrl || next.apiKey !== settings.apiKey;
    var weatherChanged = next.weatherCity !== settings.weatherCity || next.tempUnit !== settings.tempUnit;
    var stored = lsGet(LS.settings, {});
    Object.assign(stored, next);
    lsSet(LS.settings, stored);
    Object.assign(settings, next);
    closeModal();
    toast('Settings saved');
    if (rotChanged) {
      applyOrientation(true);
      if (show.photos.length) setTimeout(function () { showPhoto(1); }, 300); // refit photo to the new shape
    }
    tick(true);
    if (weatherChanged) loadWeather();
    if (apiChanged) {
      state.events = []; state.tasks = []; state.updated = null; state.errShown = false;
      loadDashboard();
      loadPhotos(true);
    }
    schedulePhoto();
  }

  // ------------------------------------------------------------------ weather (Open-Meteo, no key needed)
  function wmo(code, day) {
    if (code === 0) return { t: 'Clear', i: day ? 'sun' : 'moon' };
    if (code === 1) return { t: 'Mostly clear', i: day ? 'cloudSun' : 'moon' };
    if (code === 2) return { t: 'Partly cloudy', i: day ? 'cloudSun' : 'cloud' };
    if (code === 3) return { t: 'Overcast', i: 'cloud' };
    if (code === 45 || code === 48) return { t: 'Fog', i: 'fog' };
    if (code >= 51 && code <= 57) return { t: 'Drizzle', i: 'rain' };
    if (code >= 61 && code <= 67) return { t: 'Rain', i: 'rain' };
    if (code >= 71 && code <= 77) return { t: 'Snow', i: 'snow' };
    if (code >= 80 && code <= 82) return { t: 'Showers', i: 'rain' };
    if (code === 85 || code === 86) return { t: 'Snow showers', i: 'snow' };
    if (code >= 95) return { t: 'Thunderstorm', i: 'storm' };
    return { t: '', i: 'cloud' };
  }

  function renderWeather(g, w) {
    var c = w.current || {}, d = w.daily || {}, info = wmo(c.weather_code, c.is_day !== 0);
    var hi = d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null;
    var lo = d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null;
    var box = $('weather');
    box.innerHTML = '<span class="w-icon">' + icon(info.i) + '</span>' +
      '<span class="w-temp">' + Math.round(c.temperature_2m) + '°</span>' +
      '<span class="w-text"><span class="w-desc">' + esc(info.t) + '</span>' +
      '<span class="w-range">' + (hi !== null ? 'H ' + hi + '° · L ' + lo + '° · ' : '') + esc(g.name) + '</span></span>';
    box.hidden = false;
  }

  function loadWeather() {
    var city = String(settings.weatherCity || '').trim();
    var box = $('weather');
    if (!city) { box.hidden = true; return; }
    var q = city.split(',')[0].trim().toLowerCase();
    var unit = settings.tempUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    var geo = lsGet(LS.geo, null);
    var geoP = geo && geo.q === q ? Promise.resolve(geo) :
      fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(q))
        .then(function (j) {
          var r = j.results && j.results[0];
          if (!r) throw new Error('City not found');
          var g = { q: q, lat: r.latitude, lon: r.longitude, name: r.name };
          lsSet(LS.geo, g);
          return g;
        });
    geoP.then(function (g) {
      return fetchJson('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lon +
        '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&timezone=auto&forecast_days=1&temperature_unit=' + unit)
        .then(function (w) { renderWeather(g, w); lsSet(LS.weather, { g: g, w: w, unit: unit, at: Date.now() }); });
    }).catch(function (err) {
      var c = lsGet(LS.weather, null);
      if (c && c.g && c.g.q === q && c.unit === unit) renderWeather(c.g, c.w);
      else if (/not found/.test(err.message)) { box.hidden = true; toast('Weather: couldn’t find “' + city + '”'); }
    });
  }

  // ------------------------------------------------------------------ photo slideshow
  var slides = [$('slideA'), $('slideB')];
  var show = { photos: [], order: [], pos: -1, layer: 0, timer: null, fails: 0, loading: false, started: false };
  var ORIGINS = ['50% 50%', '30% 40%', '70% 40%', '40% 65%', '60% 30%'];

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function photoUrl(p, w, h) {
    if (p.src) return p.src;
    return String(p.u).replace(/=[whs]\d[^\/]*$/, '') + '=w' + w + '-h' + h;
  }

  function setPhotos(list) {
    list = (list || []).filter(function (p) { return p && (p.u || p.src); });
    var sig = list.map(function (p) { return p.u || p.src; }).join('|');
    if (sig === show.sig) return;
    show.sig = sig;
    show.photos = list;
    show.order = shuffle(list.map(function (_, i) { return i; }));
    show.pos = -1;
    if (!list.length) { body.classList.add('no-photos'); return; }
    if (!show.started) { show.started = true; showPhoto(1); }
  }

  function showPhoto(step) {
    if (!show.photos.length || show.loading) return;
    clearTimeout(show.timer);
    var n = show.order.length, pos = show.pos + step;
    if (pos >= n) { shuffle(show.order); pos = 0; }
    if (pos < 0) pos = n - 1;
    show.pos = pos;
    var p = show.photos[show.order[pos]];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var L = logicalSize();
    var w = Math.min(1920, Math.round(L.w * dpr)), h = Math.min(1920, Math.round(L.h * dpr));
    var url = photoUrl(p, w, h);
    show.loading = true;
    var img = new Image();
    img.onload = function () { show.loading = false; show.fails = 0; swapTo(p, url); schedulePhoto(); };
    img.onerror = function () {
      show.loading = false;
      if (++show.fails >= 5) { show.fails = 0; loadPhotos(true); } // links probably expired → re-fetch album
      schedulePhoto(4000);
    };
    img.src = url;
  }

  function schedulePhoto(ms) {
    clearTimeout(show.timer);
    if (!show.photos.length) return;
    show.timer = setTimeout(function () { showPhoto(1); }, ms || settings.slideSeconds * 1000);
  }

  function swapTo(p, url) {
    var next = slides[1 - show.layer], cur = slides[show.layer];
    var aspect = p.w && p.h ? p.w / p.h : 16 / 9;
    var L = logicalSize(), screenAspect = L.w / L.h;
    // Fill the screen when the photo's shape is close to the screen's; otherwise show the
    // whole photo over a blurred copy (portrait photos on a landscape TV and vice versa).
    var ratio = aspect / screenAspect;
    var contain = ratio < 0.7 || ratio > 1.45;
    var img = next.querySelector('.slide-img'), bg = next.querySelector('.slide-bg');
    next.classList.toggle('contain', contain);
    img.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    bg.style.backgroundImage = contain ? 'url("' + photoUrl(p, 64, 64).replace(/"/g, '%22') + '")' : 'none';
    next.classList.remove('kb');
    if (settings.kenBurns !== false) {
      next.style.setProperty('--kb-dur', (settings.slideSeconds + 5) + 's');
      img.style.transformOrigin = ORIGINS[Math.floor(Math.random() * ORIGINS.length)];
      void next.offsetWidth; // restart animation
      next.classList.add('kb');
    }
    next.classList.add('show');
    cur.classList.remove('show');
    show.layer = 1 - show.layer;
    body.classList.remove('no-photos');
  }

  function loadPhotos(force) {
    if (mode() === 'demo') { setPhotos(DEMO_PHOTOS); return; }
    if (mode() !== 'google') { setPhotos([]); return; }
    api('photos', force ? { refresh: 1 } : {})
      .then(function (j) {
        var list = j.photos || [];
        lsSet(LS.photos, list);
        setPhotos(list);
        if (!list.length) toast(j.errors && j.errors[0] ? j.errors[0] : 'No photos found — add a shared album link in the Apps Script', 6000);
      })
      .catch(function (err) { if (!show.photos.length) toast('Photos: ' + err.message, 5000); });
  }

  // ------------------------------------------------------------------ photo mode
  var photoReturnFocus = null;
  function enterPhotoMode(auto) {
    if (body.classList.contains('photo-mode')) return;
    photoReturnFocus = document.activeElement;
    body.classList.add('photo-mode');
    Nav.blur();
    pushLayer('photo', function () {
      body.classList.remove('photo-mode');
      lastActivity = Date.now(); // leaving photo mode restarts the auto-photo countdown
      if (photoReturnFocus && document.contains(photoReturnFocus)) Nav.focus(photoReturnFocus);
    });
    if (!auto && !show.photos.length) toast('No photos yet — showing the clock');
  }

  // A click or tap anywhere in photo mode brings the dashboard back (pointer-cursor browsers, PCs).
  document.addEventListener('mousedown', function () {
    if (body.classList.contains('photo-mode') && modal.hidden) closeTop();
  });

  // ------------------------------------------------------------------ remote keys (app level)
  Nav.on('key', function (e, dir) {
    var enter = e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23;
    if (!modal.hidden) return false;
    if (body.classList.contains('photo-mode')) {
      if (dir === 'right') { showPhoto(1); return true; }
      if (dir === 'left') { showPhoto(-1); return true; }
      if (dir === 'up' || dir === 'down' || enter) { closeTop(); return true; }
      return false;
    }
    if (e.key === 'MediaTrackNext' || e.keyCode === 176 || e.key === 'MediaFastForward') { showPhoto(1); return true; }
    if (e.key === 'MediaTrackPrevious' || e.keyCode === 177 || e.key === 'MediaRewind') { showPhoto(-1); return true; }
    if (e.key === 'MediaPlayPause' || e.keyCode === 179) { enterPhotoMode(); return true; }
    return false;
  });

  // ------------------------------------------------------------------ click / OK actions
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action');
    switch (a) {
      case 'photo-mode': enterPhotoMode(); break;
      case 'next-photo':
        if (show.photos.length) showPhoto(1);
        else toast(mode() === 'google' ? 'No photos yet — add a shared album link in the Apps Script' : 'Connect Google Photos in Settings first');
        break;
      case 'refresh':
        toast('Refreshing…');
        loadDashboard(); loadPhotos(false); loadWeather();
        break;
      case 'settings': openSettings(); break;
      case 'add-task': openAddTask(); break;
      case 'submit-task': submitTask(); break;
      case 'save-settings': saveSettings(); break;
      case 'close': closeModal(); break;
      case 'toggle': toggleTodo(el); break;
      case 'delete': deleteTodo(el); break;
      case 'event': openEvent(+el.getAttribute('data-idx')); break;
      case 'seg': {
        var sibs = el.parentNode.querySelectorAll('[data-action="seg"]');
        for (var i = 0; i < sibs.length; i++) sibs[i].setAttribute('aria-pressed', String(sibs[i] === el));
        break;
      }
    }
  });

  // ------------------------------------------------------------------ idle, wake lock, refresh loops
  var lastActivity = Date.now();
  Nav.on('activity', function () {
    lastActivity = Date.now();
    if (+$('nightDim').style.opacity > 0) { undimUntil = Date.now() + 60e3; applyNightDim(new Date()); }
  });
  setInterval(function () {
    var idleMs = (settings.idleBlurSeconds || 40) * 1000;
    if (Date.now() - lastActivity > idleMs && modal.hidden) {
      Nav.blur(); // hide the focus ring; the next arrow press brings it back where it was
      if (pendingTodoRender) renderTodos();
    }
    if (undimUntil && Date.now() > undimUntil) { undimUntil = 0; applyNightDim(new Date()); }

    // Auto photo mode after N minutes without input (0 = off). Not while a dialog is open.
    var autoMin = +settings.autoPhotoMinutes || 0;
    if (autoMin > 0 && modal.hidden && !body.classList.contains('photo-mode') &&
        Date.now() - lastActivity > autoMin * 60e3) {
      enterPhotoMode(true);
    }
  }, 5000);
  // On a PC, moving the mouse also counts as "someone is using it".
  var lastMove = 0;
  document.addEventListener('mousemove', function () {
    var now = Date.now();
    if (now - lastMove > 1000) { lastMove = now; lastActivity = now; }
  });

  var wakeLock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* not supported here */ });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { keepAwake(); loadDashboard(); }
  });
  window.addEventListener('online', function () { loadDashboard(); });

  // Reload once a day (04:00) so the page picks up new versions and starts fresh.
  (function scheduleReload() {
    var n = new Date(), t = new Date(n);
    t.setHours(4, 0, 0, 0);
    if (t <= n) t.setDate(t.getDate() + 1);
    setTimeout(function () { if (navigator.onLine !== false) location.reload(); else scheduleReload(); }, t - n);
  })();

  // ------------------------------------------------------------------ demo data (?demo=1)
  var DEMO_PHOTOS = [
    { src: 'https://picsum.photos/id/1015/1920/1080', w: 1920, h: 1080 },
    { src: 'https://picsum.photos/id/1036/1920/1080', w: 1920, h: 1080 },
    { src: 'https://picsum.photos/id/1043/1920/1080', w: 1920, h: 1080 },
    { src: 'https://picsum.photos/id/1039/1920/1080', w: 1920, h: 1080 }
  ];
  function demoData() {
    var now = new Date(), t0 = startOfDay(now);
    function at(day, h, m, mins) {
      var s = addDays(t0, day); s.setHours(h, m, 0, 0);
      return { start: s.toISOString(), end: new Date(s.getTime() + mins * 6e4).toISOString() };
    }
    function ev(id, title, when, color, cal, loc) { return Object.assign({ id: id, title: title, color: color, calendar: cal, location: loc || '' }, when); }
    function allDay(id, title, d1, d2, color, cal) {
      return { id: id, title: title, allDay: true, startDate: ymd(addDays(t0, d1)), endDate: ymd(addDays(t0, d2)), color: color, calendar: cal, location: '' };
    }
    var h = now.getHours();
    return {
      events: [
        ev('d1', 'Team stand-up', at(0, h, 0, 75), '#039be5', 'Work', 'Video call'),
        ev('d2', 'Pick up dry cleaning', at(0, Math.min(h + 2, 22), 30, 30), '#33b679', 'Home', 'Main Street'),
        ev('d3', 'Dinner with friends', at(0, Math.min(h + 3, 23), 0, 45), '#8e24aa', 'Family', 'Trattoria Roma'),
        allDay('d4', 'Grandma’s birthday', 1, 2, '#f6bf26', 'Birthdays'),
        ev('d5', 'Dentist appointment', at(1, 10, 0, 45), '#e67c73', 'Family', 'Smile Dental, 2nd floor'),
        ev('d6', 'Football practice', at(1, 17, 0, 90), '#7986cb', 'Kids', 'City Park field 3'),
        allDay('d7', 'Pay electricity bill', 3, 4, '#f4511e', 'Home'),
        ev('d8', 'Parent–teacher meeting', at(4, 16, 30, 60), '#7986cb', 'Kids', 'Greenwood School'),
        allDay('d9', 'Weekend trip to the hills', 5, 8, '#0b8043', 'Family')
      ],
      tasks: [
        { id: 't1', title: 'Buy milk and eggs', done: false, due: ymd(now), position: '1' },
        { id: 't2', title: 'Return library books', done: false, due: ymd(addDays(now, -1)), position: '2' },
        { id: 't3', title: 'Book train tickets for the trip', done: false, due: ymd(addDays(now, 1)), position: '3' },
        { id: 't4', title: 'Call the plumber about the kitchen tap', done: false, position: '4' },
        { id: 't5', title: 'Water the plants', done: true, completed: new Date().toISOString(), position: '5' }
      ]
    };
  }

  // ------------------------------------------------------------------ start
  restoreCache();
  tick(true);
  setInterval(tick, 1000);
  renderTodos(true);
  if (mode() === 'google') setPhotos(lsGet(LS.photos, []));
  loadDashboard();
  loadPhotos(false);
  loadWeather();
  keepAwake();

  var rm = settings.refreshMinutes;
  setInterval(loadDashboard, Math.max(1, rm.dashboard || 3) * 60e3);
  setInterval(function () { loadPhotos(false); }, Math.max(10, rm.photos || 360) * 60e3);
  setInterval(loadWeather, Math.max(10, rm.weather || 30) * 60e3);
})();
