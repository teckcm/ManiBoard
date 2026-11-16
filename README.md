# ManiBoard

A home dashboard for the **Mi Box 4K** (or any Android TV box), hosted free on GitHub Pages.

Three pages, switched from the bar at the bottom:

1. **Home**: big clock, weather, a 7-day calendar agenda (public holidays hidden), the to-do list (**Google Tasks**) and the **next two meals**.
   - Until 10am it shows breakfast and lunch.
   - Until 9pm it shows the evening snack and dinner.
   - After 9pm it shows tomorrow's breakfast and lunch.
2. **Month**: a full month calendar. Press OK on a day to see all its events.
3. **Meals**: a Monday–Sunday meal planner with the **grocery list** beside it.

The meal plan and grocery list live in a **Google Sheet you share with your family**. Anyone can edit it from the Google Sheets app on their phone, or from the TV, and it syncs both ways.
You can also **add, edit and delete calendar events** from the dashboard: use **Add event** on Home or on a Month day, or **Edit** in an event's details.

**On a phone:** open the same address in the phone's browser. It switches to a phone layout with scrolling and tabs at the bottom, and you can edit meals, groceries, tasks and events from there. Open your setup link once on each phone, just like on the TV.
Photos come from a **Google Photos** shared album. Everything is built for the TV remote: the D-pad moves a highlight, OK selects and Back closes.

Try it before setting anything up: open `index.html?demo=1` (sample data).

---

## How it works

```
 Mi Box browser ──► GitHub Pages (this repo: HTML/CSS/JS)
        │
        └────────► Your Google Apps Script (runs as you)
                     ├─ Google Calendar (yours + any calendar shared with you)
                     ├─ Google Tasks
                     ├─ Google Sheet "ManiBoard – Meals & Groceries" (shared with family)
                     └─ Google Photos shared album
```

The TV never signs in to Google. A small Apps Script in **your** Google account reads your calendar, tasks and album, and the TV reaches it with a secret key.

> Why not the Google Photos API? Since March 2025, Google only lets apps read photos they uploaded themselves. A **shared album link** is the reliable way to show your own photos.

---

## Setup (about 15 minutes)

### 1. Make a Google Photos album for the TV
1. In Google Photos, create an album (for example "TV") and add photos. Landscape photos look best.
2. **Share → Create link → Copy.** Keep the link (`https://photos.app.goo.gl/…`).
   New photos you add to this album show up on the TV within about 6 hours (or press **Refresh**).

### 2. Create the Apps Script backend
The backend is two files: **`Settings.gs`** (your key, album link and options) and **`Code.gs`** (the logic).
When ManiBoard is updated you only replace `Code.gs`, so your settings are never lost.

1. Go to <https://script.google.com> → **New project**. Name it `ManiBoard`.
2. Replace the sample code in `Code.gs` with everything from [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click **+** next to *Files* → **Script**, name it `Settings`, and paste [`apps-script/Settings.gs`](apps-script/Settings.gs). Then edit it:
   - `KEY`: any long random string, for example `k7Rq2-banana-Lp93-window`. **Treat it like a password.**
   - `ALBUM_URLS`: paste your album link(s).
4. Left sidebar, **Services (+)** → **Google Tasks API** → **Add**.
5. Pick **`setupSheet`** in the function dropdown → **Run**. Google asks for permission:
   *Review permissions → your account → Advanced → Go to ManiBoard (unsafe) → Allow*.
   (It says "unsafe" only because you wrote the app yourself and it isn't published.)
   The log prints the link to your new **"ManiBoard – Meals & Groceries"** sheet.
6. Pick `testSetup` → **Run**. The log should list your events, tasks, meals and photo count.
7. **Deploy → New deployment →** ⚙ **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (ends in `/exec`).

> **Updating the backend later:** paste the new `Code.gs` and save. If Google asks for new permissions, run `testSetup` once.
> Then go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**.
> Don't use "New deployment", because that creates a new URL.

### Sharing with your family (meals, groceries, calendar)
- **Meals and groceries:** open the sheet link from step 5 → **Share** → add your partner's Gmail as **Editor**. You both install the **Google Sheets** app and open that sheet.
  - **Meals tab:** one row per day (rows for the coming weeks are added automatically). Type dishes under *Breakfast / Lunch / Evening snack / Dinner*.
  - **Groceries tab:** type an item in the *Item* column, and tick *Bought* when you've got it.
  - Changes reach the TV within about 3 minutes, or immediately with **Refresh**. Changes made on the TV appear in the sheet straight away.
- **Calendar:** your partner opens **Google Calendar → Settings → Share with specific people → your Gmail → See all event details**. Accept the email you receive, and her events show on the TV with her calendar's colour. Public-holiday calendars are hidden. To also hide birthdays, add `'#contacts@'` to `EXCLUDE_CALENDARS` in `Settings.gs`.
- **To-do:** stays in **your** Google Tasks, because Google Tasks can't be shared between accounts. Use the shared Groceries list for things you both need to see.
- **Editing events:** new events go into your own calendars (your main calendar is the default). Only single-day, non-repeating events can be edited from the dashboard. Repeating and multi-day events show *"change it in Google Calendar"*.
- **Using it on a phone:** open the setup link (`…/ManiBoard/#api=…&key=…`) once in the phone's browser, then add the page to the home screen (browser menu → *Add to Home screen*). To force a layout, add `?view=mobile` or `?view=tv` to the address.

### 3. Put the dashboard on GitHub Pages
1. Create a new GitHub repository, for example `ManiBoard`, and upload all files in this folder.
2. Repo **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main` / `(root)` → **Save**.
3. After about a minute it's live at `https://<your-username>.github.io/ManiBoard/`.

> **Don't put your Apps Script URL or KEY in `config.js`.** The repo is public, so anyone could read your calendar.
> Enter them on the TV instead (next step). They are saved only in the TV's browser.

### 4. Set up the Mi Box
1. **Install a browser** that lets the page use the remote:
   - **Fully Kiosk Browser** (recommended for a wall dashboard): full-screen, starts on boot, keeps the screen on, and passes D-pad keys straight to the page.
     It isn't always listed on the TV's Play Store. Install the **Downloader** app, then download the APK from fully-kiosk.com.
   - **TV Bro** (from the TV Play Store) also works for trying it out.
2. **Connect the dashboard.** Open this *setup link* on the TV once (put in your own values):
   ```
   https://<your-username>.github.io/ManiBoard/#api=<WEB_APP_URL>&key=<KEY>&city=<YourCity>
   ```
   It's saved on the TV and removed from the address bar.
   **Tip:** don't type it with the remote. Install the **Google TV** app on your phone, open its remote, tap the ⌨ keyboard, and paste the text from your phone.
   You can also open **Settings** on the dashboard and fill in the fields there.
3. Set the dashboard as the browser's **start page** (Fully Kiosk: *Settings → Web Content → Start URL*).
4. **Keep the screen on.** In Fully Kiosk, turn on *Device Management → Keep Screen On*.
   Also set **Android TV Settings → Device Preferences → Screen saver** to *Never* if your firmware allows it.
   With ADB: `adb shell settings put secure screensaver_enabled 0`.

---

## Using it with the remote

| Button | What it does |
|---|---|
| ◀ ▲ ▼ ▶ | Move the highlight between buttons, events, tasks, meals and days |
| **OK** | Select: tick a task or grocery, open an event or day, edit a meal, press a button |
| **OK** on a text box | Opens the on-screen keyboard (arrowing past a text box doesn't) |
| **OK** on the ✕ next to a task or grocery | Arms delete; press **OK** again within 3 s to delete |
| **Home / Month / Meals** (bottom bar) | Switch page |
| **Back** | Close a dialog / leave Photo mode |
| **Photo mode** | Hides everything except a small clock. ◀ ▶ change photo, OK or Back returns |

After about 40 seconds without input, the highlight hides so the screen looks clean. Any arrow press brings it back where it was.

The screen dims automatically from 23:00 to 06:00. Press any button to undim it for a minute.

## Portrait (TV mounted on its side)
Android TV boxes always output landscape, so the dashboard rotates itself:
**Settings → Screen → Portrait ↻ or Portrait ↺** (pick whichever looks upright on your TV).
You can also add `&rotate=cw` or `&rotate=ccw` to the setup link.
The remote's arrows follow the rotated screen, so ▲ still moves up.
On a screen that is already tall (a phone, or a monitor rotated in its own settings) the portrait layout is used automatically. Leave Screen on *Landscape* there.

## Settings
Open **Settings** on the TV to change the backend URL/key, weather city, 12/24-hour clock, °C/°F, seconds per photo and photo zoom.
Defaults for these (and night-dim hours) live in [`config.js`](config.js).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Wrong key" | The key on the TV must match `SETTINGS.KEY` exactly. |
| "Backend did not return data" | The deployment must be *Execute as: Me*, *Access: Anyone*. Did you deploy a **new version** after editing? |
| "Add the Google Tasks API service" | Step 2.4 above. |
| "Run setupSheet once…" | Step 2.5 above, then deploy a new version. |
| "Add the Settings.gs file…" | Step 2.3 above: the backend needs both `Code.gs` and `Settings.gs`. |
| No photos | Is the album link shared (open it in a private browser window)? Run `testSetup` and check the log. |
| Feels sluggish | Turn **Photo zoom** off in Settings. |

## Files
```
index.html          page structure
css/style.css       10-foot UI styles (everything scales with the screen)
js/nav.js           remote/D-pad spatial navigation + Back-button handling
js/app.js           clock, weather, pages (home, month, meals), to-dos, groceries, slideshow, settings
config.js           defaults
apps-script/Code.gs      backend logic you paste into script.google.com
apps-script/Settings.gs  template for your backend settings (fill in on script.google.com, never here)
```
