# Promptr — Web Teleprompter

Multi-device teleprompter controlled from any phone. Android displays the script, iPhone (or any browser) controls it. Real-time sync via Firebase.

**Live:** https://mohsin-cdata.github.io/teleprompter/

## Setup (5 minutes, free forever)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project (any name)
3. Click **Web** to add a web app — copy the config values
4. Go to **Build → Realtime Database → Create database → Start in test mode**
5. Open the app, click through the setup screen, paste your config values

Firebase free tier is more than enough for personal use — 100 concurrent connections, 10 GB/month transfer.

## Usage

1. Open `index.html` on any device
2. Paste your script
3. Click **Open Prompter** on the display device (Android)
4. Open the remote link on your controller (iPhone)
5. Hit Play on the Remote

Use `---` on its own line in your script to divide into sections for Slide mode.

## Features

| Feature | Detail |
|---|---|
| Scroll modes | Auto (speed-controlled), Manual (position slider), Slide (section-by-section) |
| Font | Sans, Serif, Mono, Bold |
| Font size | 18–90px with +/- precision control |
| Line height | 1.2–2.8x |
| Colors | Text + background color pickers with 4 presets |
| Highlight bar | Fixed guide line at reading position |
| Mirror mode | Flip text for physical teleprompter glass |
| Precision speed | Main slider + nudge buttons during playback |
| Slide navigation | Prev/Next buttons with section counter |
| Wake lock | Screen stays on during recording (iOS 16.4+, Android Chrome 84+) |
| PWA | Add to Home Screen for full-screen experience |

## Architecture

- **Front-end:** Vanilla HTML/CSS/JS, no build step
- **Real-time sync:** Firebase Realtime Database
- **Hosting:** GitHub Pages
- **PWA:** Installable, offline-capable (static assets cached)
