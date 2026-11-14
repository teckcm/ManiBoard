// ManiBoard default settings.
// Anything you change in the on-screen Settings panel is saved on the TV and overrides these.
//
// ⚠ Your GitHub Pages repo is public. Do NOT put your Apps Script URL/key here unless the
//   repo is private — enter them on the TV instead (Settings, or the #api=...&key=... setup link).
window.MANIBOARD_CONFIG = {
  apiUrl: '',            // Apps Script web-app URL (ends in /exec)
  apiKey: '',            // the KEY you set in Code.gs
  weatherCity: '',       // e.g. 'London' — leave empty to hide weather
  tempUnit: 'celsius',   // 'celsius' | 'fahrenheit'
  use24h: false,
  orientation: 'landscape', // 'landscape' | 'portrait-cw' | 'portrait-ccw' (TV mounted on its side)
  slideSeconds: 30,      // seconds per background photo
  calendarDays: 14,      // how far ahead the agenda looks
  kenBurns: true,        // slow zoom on photos (turn off if the box feels sluggish)
  nightDim: { enabled: true, from: 23, to: 6, opacity: 0.6 }, // dim the screen at night
  autoPhotoMinutes: 5,   // switch to photo mode after this many idle minutes (0 = off, 0.5 = 30 seconds)
  idleBlurSeconds: 40,  // hide the focus ring after this long without remote input
  refreshMinutes: { dashboard: 3, photos: 360, weather: 30 },
};
