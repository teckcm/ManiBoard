/**
 * ManiBoard backend — YOUR settings.
 * ---------------------------------------------------------------
 * Keep this file in your Apps Script project. When ManiBoard is updated you only
 * replace Code.gs, so the values below stay as you set them.
 *
 * ⚠ This copy on GitHub is a template — never put your real KEY into the GitHub repo.
 */
const SETTINGS = {
  // A long random secret. The dashboard must send exactly this.
  KEY: 'CHANGE-ME-to-a-long-random-string',

  // Shared Google Photos album links (album → Share → Create link → Copy).
  ALBUM_URLS: [
    // 'https://photos.app.goo.gl/XXXXXXXXXXXXXXXXX',
  ],

  // Calendars to show. Empty = every calendar ticked in Google Calendar
  // (add your wife's shared calendar there and it appears automatically).
  CALENDAR_IDS: [],

  // Calendars to hide even when ticked. Matches any part of the calendar ID.
  // '#holiday@' removes all public-holiday calendars. Add '#contacts@' to hide birthdays.
  EXCLUDE_CALENDARS: ['#holiday@group.v.calendar.google.com'],

  // Google Tasks list for the to-do panel. Empty = your default list ("My Tasks").
  TASK_LIST_NAME: '',

  // Google Sheet for meals + groceries. Leave empty: run setupSheet() once and it is
  // created for you (its ID is remembered automatically).
  SHEET_ID: '',

  MAX_PHOTOS: 400,
  EVENTS_CACHE_SECONDS: 300,     // calendar is cached for 5 minutes
  PHOTOS_CACHE_SECONDS: 21600,   // album is re-read every 6 hours
};
