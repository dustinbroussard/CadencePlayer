# CadencePlayer

CadencePlayer is an Electron-based music player with a built-in visualizer and real-time chord recognition.

## What’s New

- Header dropdown next to “Cadence Player” consolidates controls:
  - Equalizer toggle
  - EQ Presets (Flat, Bass Boost, Vocal Boost) + custom presets (save/delete)
  - Visualization mode and settings
  - Chords toggle and mode selection
  - Dark/Light mode toggle
  - Queue: Save As…, Load, Delete
- Queue reordering via drag-and-drop
- Named queues: save, confirm overwrite, robust load with missing-file checks

## Usage Tips

- Add files: click Add or drag-and-drop supported media into the window.
- Chords: toggle via the dropdown; right-click the button (legacy) to cycle modes (Low-CPU, Responsive, Normal, Accurate).
- Diagnostics: press D to toggle the diagnostics overlay.
- Shortcuts: Space (play/pause), Left/Right (seek), Up/Down (volume), S (shuffle), R (repeat), Esc (close panels/menus).

## Development

- Requirements:
  - Node.js 20+ (recommended) and npm
  - Electron downloads via npm install
  - Optional (Linux): `ffmpeg` for broader codec support

- Environment variables:
  - `NODE_ENV=development` enables live reload and DevTools

- Install: `npm install`
- Run (prod): `npm start`
- Run (dev): `npm run dev`
- Test: `npm test` (Vitest + jsdom)
- Chord regression tests: `npm run test:chords`
- Chord benchmark: `npm run benchmark:chords`
- Lint: `npm run lint` / `npm run lint:fix`
- Format: `npm run format`

## Audio/Video Support

CadencePlayer uses Chromium's media stack via Electron (WebAudio + HTMLMediaElement). Most common formats are supported out of the box (MP3, WAV, AAC, M4A, OGG, FLAC, MP4, WebM). On some Linux distributions you may need to install `ffmpeg`/`libavcodec-extra` for MP3/AAC playback.

Chord recognition runs entirely in the renderer using WebAudio analysers; no external DSP libraries (e.g., Librosa/PortAudio) are required.

## CI

This repo includes a GitHub Actions workflow that runs linting, tests, and a production build on pushes and pull requests. See `.github/workflows/ci.yml`.

## Audit

A detailed repository audit with findings and recommendations is available at `docs/AUDIT.md`.
The latest debug-focused bug report is available at `docs/BUG_REPORT.md`.
The current chord benchmark baseline is available at `docs/chord-benchmark-baseline.json`.
