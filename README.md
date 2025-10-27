# CadencePlayer

[![CI](https://github.com/your-org/CadencePlayer/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/CadencePlayer/actions/workflows/ci.yml)
Replace `your-org/CadencePlayer` with your actual GitHub owner/repo path to activate the badge.

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

- Test: `npm test` (Vitest + jsdom)
- Lint: `npm run lint` / `npm run lint:fix`
- Format: `npm run format`

## CI

This repo includes a GitHub Actions workflow that runs linting and tests on pushes and PRs. See `.github/workflows/ci.yml`.

## Audit

A detailed repository audit with findings and recommendations is available at `docs/AUDIT.md`.
