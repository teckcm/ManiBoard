# ManiBoard

A home dashboard for the **Mi Box 4K** (or any Android TV box), hosted free on GitHub Pages.

- 🕒 Big clock, date and weather
- 📅 Google Calendar agenda (next 14 days)
- ✅ To-do list synced with **Google Tasks**, so you can add things from your phone and tick them off on the TV
- 🖼️ Background slideshow from a **Google Photos** shared album
- 🎮 Built for the remote: D-pad moves a highlighted focus ring, OK selects, Back closes

Try it before setting anything up: open `index.html?demo=1` (sample data).

---

## How it works

```
 Mi Box browser ──► GitHub Pages (this repo: HTML/CSS/JS)
        │
        └────────► Your Google Apps Script (runs as you)
                     ├─ Google Calendar
                     ├─ Google Tasks
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
1. Go to <https://script.google.com> → **New project**. Name it `ManiBoard`.
2. Delete the sample code and paste everything from [`apps-script/Code.gs`](apps-script/Code.gs).
3. At the top, edit `SETTINGS`:
   - `KEY`: any long random string, for example `k7Rq2-banana-Lp93-window`. **Treat it like a password.**
   - `ALBUM_URLS`: paste your album link(s).
4. Left sidebar, **Services (+)** → **Google Tasks API** → **Add**.
5. Pick `testSetup` in the function dropdown → **Run**. Google asks for permission:
   *Review permissions → your account → Advanced → Go to ManiBoard (unsafe) → Allow*.
   (It says "unsafe" only because you wrote the app yourself and it isn't published.)
   The log should list your events, tasks and photo count.
6. **Deploy → New deployment →** ⚙ **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (ends in `/exec`).

> If you change `Code.gs` later: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**.
> The URL stays the same.

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
| ◀ ▲ ▼ ▶ | Move the highlight between buttons, events and tasks |
| **OK** | Select: tick a task, open an event's details, press a button |
| **OK** on the ✕ next to a task | Arms delete; press **OK** again within 3 s to delete |
| **Back** | Close a dialog / leave Photo mode |
| **Photo mode** | Hides everything except a small clock. ◀ ▶ change photo, OK or Back returns |

After about 40 seconds without input, the highlight hides so the screen looks clean. Any arrow press brings it back where it was.

The screen dims automatically from 23:00 to 06:00. Press any button to undim it for a minute.

## Settings
Open **Settings** on the TV to change the backend URL/key, weather city, 12/24-hour clock, °C/°F, seconds per photo and photo zoom.
Defaults for these (and night-dim hours) live in [`config.js`](config.js).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Wrong key" | The key on the TV must match `SETTINGS.KEY` exactly. |
| "Backend did not return data" | The deployment must be *Execute as: Me*, *Access: Anyone*. Did you deploy a **new version** after editing? |
| "Add the Google Tasks API service" | Step 2.4 above. |
| No photos | Is the album link shared (open it in a private browser window)? Run `testSetup` and check the log. |
| Feels sluggish | Turn **Photo zoom** off in Settings. |

## Files
```
index.html          page structure
css/style.css       10-foot UI styles (everything scales with the screen)
js/nav.js           remote/D-pad spatial navigation + Back-button handling
js/app.js           clock, weather, calendar, to-dos, slideshow, settings
config.js           defaults
apps-script/Code.gs backend you paste into script.google.com
```
