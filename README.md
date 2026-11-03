# EPUB Type — Typing Trainer for EPUB Books

A complete PWA typing trainer that loads **your own EPUB files**, lets you skip any
sections, and tracks WPM, accuracy, streaks, and achievements. Runs 100 % in the
browser — no server required.

## Features

- Upload EPUBs (drag-drop or picker). Multiple books supported.
- Checkbox picker to **skip cover, TOC, preface, etc.** + one-click "Auto-skip front matter".
- Typing engine with live WPM / CPM / accuracy / errors / chars / timer.
- **Pause / Resume**, restart, auto-advance to next section.
- **Mobile keyboard** handled via hidden input + `beforeinput` (works iOS/Android).
- **Auto-scroll** to cursor. Char or word highlighting. Focus-line / focus-para modes.
- **Session history** — every completed section logged with stats.
- **Stats dashboard** — totals, averages, best, streak, daily goal, WPM chart.
- **12 achievements** — unlock by typing milestones, WPM, streaks, accuracy.
- **Daily goal + streak tracking**.
- **Sound effects** (Web Audio) for keys, errors, completion — volume adjustable.
- **Appearance**: theme (auto/light/dark), accent color, font family/size/line-height.
- **Export / import** full data as JSON. **Reset** everything.
- **PWA**: installable, offline via service worker.

## Deploy to GitHub Pages

1. Create a repo (e.g. `epub-type`).
2. Upload all files **and** the `icons/` folder to the repo root.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: **main**, folder: **/ (root)** → **Save**.
4. After ~1 min, visit `https://<your-username>.github.io/epub-type/`.

## iOS home-screen icon

The default manifest uses `icons/icon.svg` (works on Android/Chrome/Edge).
For iOS add a PNG:

1. Convert `icons/icon.svg` to 512×512 PNG (any online converter).
2. Save as `icons/icon-512.png` (and optionally 192×192).
3. Add to `manifest.webmanifest` → `icons` array:
   ```json
   { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
