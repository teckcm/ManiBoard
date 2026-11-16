/**
 * ManiBoard backend — Google Apps Script (logic)
 * ---------------------------------------------------------------
 * Runs under YOUR Google account and gives the TV dashboard:
 *   • Google Calendar events (holiday calendars filtered out)
 *   • Google Tasks (read, add, tick off, delete)
 *   • photos from SHARED Google Photos albums
 *   • a weekly meal plan + grocery list kept in a Google Sheet you share with your family
 *
 * Your key, album links etc. live in Settings.gs — updating ManiBoard only replaces this file.
 * Full setup steps are in README.md.
 */

// Google Calendar event colour IDs → hex
const EVENT_COLORS = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};
const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_HEADERS = ['Date', 'Day', 'Breakfast', 'Lunch', 'Evening snack', 'Dinner'];

// Read a value from Settings.gs, with a default if it's missing (older Settings.gs files).
function cfg_(name, def) {
  return (typeof SETTINGS !== 'undefined' && SETTINGS[name] !== undefined) ? SETTINGS[name] : def;
}

// ------------------------------------------------------------------ entry point
function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = cfg_('KEY', '');
  if (!key) return json_({ error: 'Add the Settings.gs file to the Apps Script project' });
  if (key.indexOf('CHANGE-ME') === 0) return json_({ error: 'Set KEY in Settings.gs, then deploy a new version' });
  if (p.key !== key) return json_({ error: 'Wrong key' });

  try {
    switch (p.action) {
      case 'ping':
        return json_({ ok: true });
      case 'dashboard':
        return json_(dashboard_(p));
      case 'events':
        return json_({ events: getEvents_(p.from, Number(p.days) || 42) });

      // ---- Calendar editing
      case 'event.add':
        return json_(withLock_(function () { saveEvent_(p, null); bumpEvents_(); return { ok: true }; }));
      case 'event.update':
        requireText_(p.id, 'id');
        return json_(withLock_(function () { saveEvent_(p, p.id); bumpEvents_(); return { ok: true }; }));
      case 'event.delete':
        requireText_(p.id, 'id');
        return json_(withLock_(function () { deleteEvent_(p.cal, p.id); bumpEvents_(); return { ok: true }; }));
      case 'photos':
        return json_(photos_(p.refresh === '1'));

      // ---- Google Tasks
      case 'task.add':
        requireText_(p.title, 'title');
        Tasks.Tasks.insert(taskResource_(p.title, p.due), taskListId_());
        return json_({ tasks: listTasks_() });
      case 'task.toggle': {
        requireText_(p.id, 'id');
        const listId = taskListId_();
        const t = Tasks.Tasks.get(listId, p.id);
        if (p.done === '1') {
          t.status = 'completed';
        } else {
          t.status = 'needsAction';
          t.completed = null;
        }
        Tasks.Tasks.update(t, listId, p.id);
        return json_({ tasks: listTasks_() });
      }
      case 'task.delete':
        requireText_(p.id, 'id');
        Tasks.Tasks.remove(taskListId_(), p.id);
        return json_({ tasks: listTasks_() });

      // ---- Meals (Google Sheet)
      case 'meals':
        return json_({ meals: readMeals_(p.from, Number(p.days) || 7) });
      case 'meal.set':
        return json_(withLock_(function () { setMeal_(p.date, p.slot, p.text || ''); return { ok: true }; }));

      // ---- Groceries (Google Sheet)
      case 'grocery.add':
        requireText_(p.item, 'item');
        return json_(withLock_(function () { addGrocery_(p.item); return { groceries: listGroceries_() }; }));
      case 'grocery.toggle':
        requireText_(p.id, 'id');
        return json_(withLock_(function () { toggleGrocery_(p.id, p.done === '1'); return { groceries: listGroceries_() }; }));
      case 'grocery.delete':
        requireText_(p.id, 'id');
        return json_(withLock_(function () { deleteGrocery_(p.id); return { groceries: listGroceries_() }; }));
      case 'grocery.clear':
        return json_(withLock_(function () { clearBoughtGroceries_(); return { groceries: listGroceries_() }; }));

      default:
        return json_({ error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ error: friendly_(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function requireText_(v, name) {
  if (!v || !String(v).trim()) throw new Error('Missing ' + name);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function friendly_(err) {
  const msg = String((err && err.message) || err);
  if (/Tasks is not defined/.test(msg)) return 'Add the "Google Tasks API" service in Apps Script (Services → +)';
  return msg;
}

// ------------------------------------------------------------------ dashboard
function dashboard_(p) {
  const out = { events: [], tasks: [], meals: null, groceries: null, errors: [] };
  try { out.events = getEvents_(p.from, Number(p.days) || 7); out.calendars = writableCalendars_(); }
  catch (e) { out.errors.push('Calendar: ' + friendly_(e)); }
  try { out.tasks = listTasks_(); }
  catch (e) { out.errors.push('Tasks: ' + friendly_(e)); }
  if (p.mealsFrom) {
    try { out.meals = readMeals_(p.mealsFrom, Number(p.mealDays) || 14); }
    catch (e) { out.errors.push('Meals: ' + friendly_(e)); }
    try { out.groceries = listGroceries_(); }
    catch (e) { if (!out.errors.length || out.errors[out.errors.length - 1].indexOf('Meals:') !== 0) out.errors.push('Groceries: ' + friendly_(e)); }
  }
  return out;
}

// ------------------------------------------------------------------ calendar
function isExcludedCalendar_(id) {
  const patterns = cfg_('EXCLUDE_CALENDARS', ['#holiday@group.v.calendar.google.com']);
  return patterns.some(function (pat) { return pat && String(id).indexOf(pat) >= 0; });
}

function getEvents_(fromIso, days) {
  let from = fromIso ? new Date(fromIso) : new Date();
  if (isNaN(from.getTime())) from = new Date();
  days = Math.min(Math.max(days, 1), 60);
  const to = new Date(from.getTime() + days * 864e5);

  const cache = CacheService.getScriptCache();
  const cacheKey = 'ev3:' + eventsVersion_() + ':' + from.getTime() + ':' + days;
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const tz = Session.getScriptTimeZone();
  const ids = cfg_('CALENDAR_IDS', []);
  const calendars = (ids.length
    ? ids.map(function (id) { return CalendarApp.getCalendarById(id); }).filter(Boolean)
    : CalendarApp.getAllCalendars().filter(function (c) { return c.isSelected() && !c.isHidden(); })
  ).filter(function (c) { return !isExcludedCalendar_(c.getId()); });

  const events = [];
  calendars.forEach(function (cal) {
    let list;
    try { list = cal.getEvents(from, to); } catch (e) { return; } // some special calendars can't be read
    const calColor = cal.getColor();
    const calName = cal.getName();
    list.forEach(function (ev) {
      try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (e) { /* not an invite */ }
      let recurring = false;
      try { recurring = ev.isRecurringEvent(); } catch (e) { /* ignore */ }
      const item = {
        id: ev.getId(),
        calendarId: cal.getId(),
        recurring: recurring,
        title: ev.getTitle() || '(No title)',
        allDay: ev.isAllDayEvent(),
        color: EVENT_COLORS[ev.getColor()] || calColor,
        calendar: calName,
        location: ev.getLocation() || '',
        description: cleanText_(ev.getDescription()).slice(0, 600),
      };
      if (item.allDay) {
        item.startDate = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
        item.endDate = Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd'); // exclusive
      } else {
        item.start = ev.getStartTime().toISOString();
        item.end = ev.getEndTime().toISOString();
      }
      events.push(item);
    });
  });

  events.sort(function (a, b) { return (a.start || a.startDate) < (b.start || b.startDate) ? -1 : 1; });
  try { cache.put(cacheKey, JSON.stringify(events), cfg_('EVENTS_CACHE_SECONDS', 300)); } catch (e) { /* too big to cache */ }
  return events;
}

// Calendar caches include a version number, bumped on every change made from the dashboard,
// so an added / edited / deleted event shows up straight away.
function eventsVersion_() {
  return PropertiesService.getScriptProperties().getProperty('EV_VER') || '0';
}
function bumpEvents_() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EV_VER', String(Number(props.getProperty('EV_VER') || 0) + 1));
}

// Calendars you can add events to from the dashboard (your default calendar first).
function writableCalendars_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('wcal');
  if (hit) return JSON.parse(hit);
  const primaryId = CalendarApp.getDefaultCalendar().getId();
  const list = CalendarApp.getAllCalendars()
    .filter(function (c) {
      const id = c.getId();
      return c.isSelected() && !c.isHidden() && !isExcludedCalendar_(id) &&
        id.indexOf('#holiday@') < 0 && id.indexOf('#contacts@') < 0 && id.indexOf('#weeknum@') < 0 &&
        (c.isOwnedByMe() || id === primaryId);
    })
    .map(function (c) { return { id: c.getId(), name: c.getName(), color: c.getColor(), primary: c.getId() === primaryId }; })
    .sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
  try { cache.put('wcal', JSON.stringify(list), 600); } catch (e) { /* ignore */ }
  return list;
}

function calendarFor_(id) {
  const cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Calendar not found — you may not have access to it');
  return cal;
}

function parseHm_(s) {
  if (!/^\d{1,2}:\d{2}$/.test(String(s || ''))) throw new Error('Pick a start and end time');
  return String(s);
}

// Create (id = null) or update a single, non-repeating event.
function saveEvent_(p, id) {
  const title = String(p.title || '').trim().slice(0, 300);
  if (!title) throw new Error('The event needs a title');
  const date = validYmd_(p.date);
  const allDay = p.allDay === '1';
  const tz = Session.getScriptTimeZone();
  const cal = calendarFor_(p.cal);
  let start, end;
  if (allDay) {
    start = Utilities.parseDate(date, tz, 'yyyy-MM-dd');
  } else {
    start = Utilities.parseDate(date + ' ' + parseHm_(p.start), tz, 'yyyy-MM-dd HH:mm');
    end = Utilities.parseDate(date + ' ' + parseHm_(p.end), tz, 'yyyy-MM-dd HH:mm');
    if (end <= start) end = new Date(end.getTime() + 864e5); // ends after midnight
  }
  const location = String(p.location || '').trim().slice(0, 300);
  try {
    if (!id) {
      if (allDay) cal.createAllDayEvent(title, start, { location: location });
      else cal.createEvent(title, start, end, { location: location });
      return;
    }
    const ev = cal.getEventById(id);
    if (!ev) throw new Error('Event not found — it may have been deleted');
    if (ev.isRecurringEvent()) throw new Error('Repeating events can only be changed in Google Calendar');
    ev.setTitle(title);
    ev.setLocation(location);
    if (allDay) ev.setAllDayDate(start); else ev.setTime(start, end);
  } catch (e) {
    if (/permission|access|forbidden/i.test(String(e.message))) {
      throw new Error('You can\'t change "' + cal.getName() + '" — ask its owner for "Make changes to events" access');
    }
    throw e;
  }
}

function deleteEvent_(calId, id) {
  const cal = calendarFor_(calId);
  const ev = cal.getEventById(id);
  if (!ev) return; // already gone
  if (ev.isRecurringEvent()) throw new Error('Repeating events can only be deleted in Google Calendar');
  try {
    ev.deleteEvent();
  } catch (e) {
    throw new Error('You can\'t delete events in "' + cal.getName() + '"');
  }
}

function cleanText_(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------------------------------------------ tasks
function taskListId_() {
  const name = cfg_('TASK_LIST_NAME', '');
  if (!name) return '@default';
  const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const match = lists.filter(function (l) { return String(l.title).toLowerCase() === name.toLowerCase(); })[0];
  if (!match) throw new Error('Task list "' + name + '" not found');
  return match.id;
}

function taskResource_(title, due) {
  const t = { title: String(title).trim().slice(0, 1000) };
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) t.due = due + 'T00:00:00.000Z';
  return t;
}

function listTasks_() {
  // showHidden is needed to see tasks ticked off in the Google Tasks apps.
  const res = Tasks.Tasks.list(taskListId_(), { showCompleted: true, showHidden: true, maxResults: 100 });
  const cutoff = Date.now() - 2 * 864e5;
  return (res.items || [])
    .filter(function (t) {
      if (!t.title || t.deleted) return false;
      if (t.status !== 'completed') return true;
      return t.completed && new Date(t.completed).getTime() > cutoff; // keep recently done ones
    })
    .map(function (t) {
      return {
        id: t.id,
        title: t.title,
        done: t.status === 'completed',
        due: t.due ? String(t.due).slice(0, 10) : '',
        completed: t.completed || '',
        position: (t.parent ? t.parent + '.' : '') + (t.position || ''),
      };
    });
}

// ------------------------------------------------------------------ meals + groceries sheet
function spreadsheet_() {
  const id = cfg_('SHEET_ID', '') || PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setupSheet once in Apps Script to create the meals & groceries sheet');
  return SpreadsheetApp.openById(id);
}

function tab_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('The sheet has no "' + name + '" tab — run setupSheet again');
  return sh;
}

// Date helpers on plain 'yyyy-MM-dd' strings (no time-zone surprises).
function ymdAdd_(ymd, n) {
  const p = String(ymd).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
function ymdList_(fromYmd, days) {
  const out = [];
  for (let i = 0; i < days; i++) out.push(ymdAdd_(fromYmd, i));
  return out;
}
function ymdOf_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function todayYmd_(tz) { return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); }
function weekdayShort_(ymd) {
  return Utilities.formatDate(new Date(ymd + 'T12:00:00Z'), 'UTC', 'EEE');
}
function validYmd_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error('Bad date');
  return String(s);
}

// Map of 'yyyy-MM-dd' → { row, values } for the Meals tab.
function mealRows_(sh, tz) {
  const last = sh.getLastRow(), map = {};
  if (last < 2) return map;
  sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r, i) {
    const d = ymdOf_(r[0], tz);
    if (d && !map[d]) map[d] = { row: i + 2, values: r };
  });
  return map;
}

// Add rows for any of these dates that are missing, then keep the tab sorted by date.
function ensureMealRows_(sh, dates, tz) {
  const have = mealRows_(sh, tz);
  const missing = dates.filter(function (d) { return !have[d]; });
  if (!missing.length) return false;
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, missing.length, 2).setValues(missing.map(function (d) { return [d, weekdayShort_(d)]; }));
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).sort({ column: 1, ascending: true });
  return true;
}

function readMeals_(fromYmd, days) {
  days = Math.min(Math.max(days, 1), 35);
  const ss = spreadsheet_(), sh = tab_(ss, 'Meals'), tz = ss.getSpreadsheetTimeZone();
  const dates = ymdList_(validYmd_(fromYmd), days);
  // Create empty rows for nearby weeks so they're ready to fill in on the phone.
  const today = todayYmd_(tz), lo = ymdAdd_(today, -14), hi = ymdAdd_(today, 35);
  const nearby = dates.filter(function (d) { return d >= lo && d <= hi; });
  if (nearby.length) withLock_(function () { ensureMealRows_(sh, nearby, tz); });
  const rows = mealRows_(sh, tz);
  return dates.map(function (d) {
    const v = rows[d] ? rows[d].values : [];
    return {
      date: d,
      breakfast: String(v[2] || '').trim(),
      lunch: String(v[3] || '').trim(),
      snack: String(v[4] || '').trim(),
      dinner: String(v[5] || '').trim(),
    };
  });
}

function setMeal_(date, slot, text) {
  const idx = MEAL_SLOTS.indexOf(slot);
  if (idx < 0) throw new Error('Unknown meal');
  const ss = spreadsheet_(), sh = tab_(ss, 'Meals'), tz = ss.getSpreadsheetTimeZone();
  date = validYmd_(date);
  ensureMealRows_(sh, [date], tz);
  const row = mealRows_(sh, tz)[date].row;
  sh.getRange(row, 3 + idx).setValue(String(text).trim().slice(0, 200));
}

// Groceries tab: A = Bought (tick box), B = Item, C = ID (hidden, filled in automatically).
function listGroceries_() {
  const sh = tab_(spreadsheet_(), 'Groceries');
  const last = sh.getLastRow();
  if (last < 2) return [];
  const out = [];
  sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r, i) {
    const item = String(r[1] || '').trim();
    if (!item) return;
    let id = String(r[2] || '').trim();
    if (!id) { id = Utilities.getUuid().slice(0, 8); sh.getRange(i + 2, 3).setValue(id); } // added on a phone
    out.push({ id: id, item: item, done: r[0] === true || String(r[0]).toUpperCase() === 'TRUE' });
  });
  return out;
}

function groceryRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 3, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function addGrocery_(item) {
  const sh = tab_(spreadsheet_(), 'Groceries');
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 3).setValues([[false, String(item).trim().slice(0, 200), Utilities.getUuid().slice(0, 8)]]);
  sh.getRange(row, 1).insertCheckboxes();
}

function toggleGrocery_(id, done) {
  const sh = tab_(spreadsheet_(), 'Groceries');
  const row = groceryRow_(sh, id);
  if (!row) throw new Error('Item not found — it may have been removed on another device');
  sh.getRange(row, 1).setValue(!!done);
}

function deleteGrocery_(id) {
  const sh = tab_(spreadsheet_(), 'Groceries');
  const row = groceryRow_(sh, id);
  if (row) sh.deleteRow(row);
}

function clearBoughtGroceries_() {
  const sh = tab_(spreadsheet_(), 'Groceries');
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    const bought = vals[i][0] === true || String(vals[i][0]).toUpperCase() === 'TRUE';
    if (bought && String(vals[i][1] || '').trim()) sh.deleteRow(i + 2);
  }
}

// ------------------------------------------------------------------ photos (shared albums)
function photos_(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const hit = getBig_(cache, 'photos');
    if (hit) return { photos: JSON.parse(hit) };
  }
  const seen = {};
  const photos = [];
  const errors = [];
  const albums = cfg_('ALBUM_URLS', []);
  albums.forEach(function (url) {
    try {
      const res = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      const found = parseAlbum_(res.getContentText());
      if (!found.length) throw new Error('no photos found (is the link shared?)');
      found.forEach(function (p) { if (!seen[p.u]) { seen[p.u] = 1; photos.push(p); } });
    } catch (e) {
      errors.push('Album ' + url + ': ' + e.message);
    }
  });
  const list = photos.slice(0, cfg_('MAX_PHOTOS', 400));
  if (list.length) putBig_(cache, 'photos', JSON.stringify(list), cfg_('PHOTOS_CACHE_SECONDS', 21600));
  if (!albums.length) errors.push('No album links yet — add one to ALBUM_URLS in Settings.gs');
  return { photos: list, errors: errors };
}

// The public album page embeds every photo as ["https://lh3.googleusercontent.com/pw/…", width, height, …]
function parseAlbum_(html) {
  const out = [];
  let re = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"]+)",(\d+),(\d+)/g;
  let m;
  while ((m = re.exec(html))) out.push({ u: m[1], w: Number(m[2]), h: Number(m[3]) });
  if (!out.length) { // older album format
    re = /\["(https:\/\/lh3\.googleusercontent\.com\/(?!a\/|a-\/)[^"]+)",(\d+),(\d+)/g;
    while ((m = re.exec(html))) out.push({ u: m[1], w: Number(m[2]), h: Number(m[3]) });
  }
  return out;
}

// CacheService values are limited to 100 KB, so big values are split into chunks.
function putBig_(cache, key, value, seconds) {
  const size = 90000, parts = {};
  let n = 0;
  for (let i = 0; i < value.length; i += size) parts[key + ':' + n++] = value.slice(i, i + size);
  parts[key + ':n'] = String(n);
  try { cache.putAll(parts, seconds); } catch (e) { /* ignore */ }
}

function getBig_(cache, key) {
  const n = Number(cache.get(key + ':n'));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + ':' + i);
  const got = cache.getAll(keys);
  let s = '';
  for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return null; s += got[keys[i]]; }
  return s;
}

// ------------------------------------------------------------------ run these from the editor
/**
 * Run ONCE: creates the "ManiBoard – Meals & Groceries" Google Sheet (or repairs it),
 * with a Meals tab (rows ready for this week and the next two) and a Groceries tab.
 * The link is printed in the log — open it and Share it with your wife as Editor.
 */
function setupSheet() {
  const props = PropertiesService.getScriptProperties();
  const id = cfg_('SHEET_ID', '') || props.getProperty('SHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('ManiBoard – Meals & Groceries');
    ss.getSheets()[0].setName('Meals');
  }
  props.setProperty('SHEET_ID', ss.getId());

  let meals = ss.getSheetByName('Meals') || ss.insertSheet('Meals');
  if (meals.getLastRow() === 0) {
    meals.getRange(1, 1, 1, 6).setValues([MEAL_HEADERS]).setFontWeight('bold');
    meals.setFrozenRows(1);
    meals.setColumnWidth(1, 110);
    meals.setColumnWidth(2, 60);
    meals.setColumnWidths(3, 4, 220);
  }

  let groc = ss.getSheetByName('Groceries') || ss.insertSheet('Groceries');
  if (groc.getLastRow() === 0) {
    groc.getRange(1, 1, 1, 3).setValues([['Bought', 'Item', 'ID (automatic)']]).setFontWeight('bold');
    groc.setFrozenRows(1);
    groc.setColumnWidth(1, 70);
    groc.setColumnWidth(2, 280);
  }
  groc.getRange('A2:A1000').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  groc.hideColumns(3);

  const tz = ss.getSpreadsheetTimeZone();
  const today = todayYmd_(tz);
  const dow = Number(Utilities.formatDate(new Date(), tz, 'u')); // 1 = Monday
  ensureMealRows_(meals, ymdList_(ymdAdd_(today, 1 - dow), 21), tz);

  Logger.log('✅ Meals & groceries sheet is ready: ' + ss.getUrl());
  Logger.log('👉 Open that link → Share → add your wife\'s Gmail → Editor. You both edit it in the Google Sheets app.');
}

/**
 * Select "testSetup" in the toolbar and press Run. The first time, Google asks you to
 * allow access — this is your own script, so choose Advanced → "Go to … (unsafe)" → Allow.
 * Then check the log at the bottom for what the TV will see.
 */
function testSetup() {
  const tz = Session.getScriptTimeZone();
  const d = dashboard_({ days: 7, mealsFrom: todayYmd_(tz), mealDays: 2 });
  Logger.log('Calendar events (next 7 days, holidays removed): ' + d.events.length);
  d.events.slice(0, 5).forEach(function (e) { Logger.log('   • ' + (e.start || e.startDate) + '  ' + e.title + '  [' + e.calendar + ']'); });
  Logger.log('Tasks: ' + d.tasks.length);
  if (d.meals) d.meals.forEach(function (m) { Logger.log('Meals ' + m.date + ': ' + [m.breakfast, m.lunch, m.snack, m.dinner].join(' | ')); });
  if (d.groceries) Logger.log('Groceries: ' + d.groceries.length + ' items');
  const ph = photos_(true);
  Logger.log('Photos: ' + ph.photos.length);
  (d.errors.concat(ph.errors || [])).forEach(function (e) { Logger.log('⚠ ' + e); });
}
