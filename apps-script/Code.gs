/**
 * ManiBoard backend — Google Apps Script
 * ---------------------------------------------------------------
 * Runs under YOUR Google account and gives the TV dashboard:
 *   • your Google Calendar events
 *   • your Google Tasks (read, add, tick off, delete)
 *   • photos from one or more SHARED Google Photos albums
 *
 * The TV never signs in to Google; it only knows this script's URL + KEY.
 * Full setup steps are in README.md.
 */

const SETTINGS = {
  // 1) A long random secret. The dashboard must send exactly this. CHANGE IT.
  KEY: 'CHANGE-ME-to-a-long-random-string',

  // 2) Shared Google Photos album links (in Google Photos: album → Share → Create link → Copy).
  ALBUM_URLS: [
    // 'https://photos.app.goo.gl/XXXXXXXXXXXXXXXXX',
  ],

  // 3) Calendars to show. Leave empty = every calendar that is ticked in Google Calendar.
  //    Otherwise list calendar IDs (Calendar settings → "Integrate calendar" → Calendar ID).
  CALENDAR_IDS: [],

  // 4) Google Tasks list to use. Leave empty = your default list ("My Tasks").
  TASK_LIST_NAME: '',

  MAX_PHOTOS: 400,
  EVENTS_CACHE_SECONDS: 300,     // calendar is cached for 5 minutes
  PHOTOS_CACHE_SECONDS: 21600,   // album is re-read every 6 hours
};

// Google Calendar event colour IDs → hex
const EVENT_COLORS = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

// ------------------------------------------------------------------ entry point
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!SETTINGS.KEY || SETTINGS.KEY.indexOf('CHANGE-ME') === 0) {
    return json_({ error: 'Set SETTINGS.KEY in the Apps Script, then deploy a new version' });
  }
  if (p.key !== SETTINGS.KEY) return json_({ error: 'Wrong key' });

  try {
    switch (p.action) {
      case 'ping':
        return json_({ ok: true });
      case 'dashboard':
        return json_(dashboard_(p));
      case 'photos':
        return json_(photos_(p.refresh === '1'));
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

function friendly_(err) {
  const msg = String((err && err.message) || err);
  if (/Tasks is not defined/.test(msg)) return 'Add the "Google Tasks API" service in Apps Script (Services → +)';
  return msg;
}

// ------------------------------------------------------------------ dashboard
function dashboard_(p) {
  const out = { events: [], tasks: [], errors: [] };
  try { out.events = getEvents_(p.from, Number(p.days) || 14); }
  catch (e) { out.errors.push('Calendar: ' + friendly_(e)); }
  try { out.tasks = listTasks_(); }
  catch (e) { out.errors.push('Tasks: ' + friendly_(e)); }
  return out;
}

// ------------------------------------------------------------------ calendar
function getEvents_(fromIso, days) {
  let from = fromIso ? new Date(fromIso) : new Date();
  if (isNaN(from.getTime())) from = new Date();
  days = Math.min(Math.max(days, 1), 60);
  const to = new Date(from.getTime() + days * 864e5);

  const cache = CacheService.getScriptCache();
  const cacheKey = 'ev:' + from.getTime() + ':' + days;
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const tz = Session.getScriptTimeZone();
  const calendars = SETTINGS.CALENDAR_IDS.length
    ? SETTINGS.CALENDAR_IDS.map(function (id) { return CalendarApp.getCalendarById(id); }).filter(Boolean)
    : CalendarApp.getAllCalendars().filter(function (c) { return c.isSelected() && !c.isHidden(); });

  const events = [];
  calendars.forEach(function (cal) {
    let list;
    try { list = cal.getEvents(from, to); } catch (e) { return; } // some special calendars can't be read
    const calColor = cal.getColor();
    const calName = cal.getName();
    list.forEach(function (ev) {
      try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (e) { /* not an invite */ }
      const item = {
        id: ev.getId(),
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
  try { cache.put(cacheKey, JSON.stringify(events), SETTINGS.EVENTS_CACHE_SECONDS); } catch (e) { /* too big to cache */ }
  return events;
}

function cleanText_(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------------------------------------------ tasks
function taskListId_() {
  if (!SETTINGS.TASK_LIST_NAME) return '@default';
  const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const want = SETTINGS.TASK_LIST_NAME.toLowerCase();
  const match = lists.filter(function (l) { return String(l.title).toLowerCase() === want; })[0];
  if (!match) throw new Error('Task list "' + SETTINGS.TASK_LIST_NAME + '" not found');
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
  SETTINGS.ALBUM_URLS.forEach(function (url) {
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
  const list = photos.slice(0, SETTINGS.MAX_PHOTOS);
  if (list.length) putBig_(cache, 'photos', JSON.stringify(list), SETTINGS.PHOTOS_CACHE_SECONDS);
  if (!SETTINGS.ALBUM_URLS.length) errors.push('No album links yet — add one to ALBUM_URLS in the Apps Script');
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

// ------------------------------------------------------------------ run this once from the editor
/**
 * Select "testSetup" in the toolbar and press Run. The first time, Google asks you to
 * allow access — this is your own script, so choose Advanced → "Go to … (unsafe)" → Allow.
 * Then check the log at the bottom for what the TV will see.
 */
function testSetup() {
  const d = dashboard_({ days: 7 });
  Logger.log('Calendar events (next 7 days): ' + d.events.length);
  d.events.slice(0, 5).forEach(function (e) { Logger.log('   • ' + (e.start || e.startDate) + '  ' + e.title); });
  Logger.log('Tasks: ' + d.tasks.length);
  d.tasks.slice(0, 5).forEach(function (t) { Logger.log('   • ' + (t.done ? '[x] ' : '[ ] ') + t.title); });
  const ph = photos_(true);
  Logger.log('Photos: ' + ph.photos.length);
  (d.errors.concat(ph.errors || [])).forEach(function (e) { Logger.log('⚠ ' + e); });
}
