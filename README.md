# EPUB Type – Typing Trainer for EPUB Books

A PWA that lets you upload any EPUB, choose which sections to type, and practise typing with live WPM/accuracy stats.

## Features

- **EPUB upload** (drag & drop or file picker)
- **Section skipping** – exclude cover, TOC, preface, etc.
- **Auto‑skip front matter** with one click
- **Multiple books** in a local library
- **Per‑section progress** auto‑saved
- **Live WPM, accuracy, error count, timer**
- **Strict / lenient punctuation mode**
- **Zen mode** (hide UI while typing)
- **Dark / light theme**
- **PWA** – installable, works offline
- **Keyboard shortcuts** (Tab to skip a character, Backspace to go back)
- **Responsive** – phone, tablet, desktop

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `epub-type`).
2. Upload all files **including the `icons/` folder** to the root of the repo.
3. Go to **Settings → Pages**.
4. Under “Build and deployment”, set **Source** to “Deploy from a branch”.
5. Choose the `main` branch and the `/ (root)` folder.
6. Click **Save**.
7. After a minute, your app will be live at `https://<your-username>.github.io/epub-type/`.

## Local testing

Because the app uses a service worker, serve it over HTTP (not `file://`).  
For example, run `npx serve` in the project folder, then open `http://localhost:3000`.

## Notes

- The EPUB parser extracts **plain text** from XHTML sections. Complex layouts (images, tables) are ignored during typing.
- Progress is stored in `localStorage`. Clearing browser data will erase it.
- Replace the placeholder icons in `icons/` with your own branding if desired.
