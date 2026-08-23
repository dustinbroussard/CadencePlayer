# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.1] - 2026-05-22

### Added
- **Automated Coverage Testing:** Integrated `@vitest/coverage-v8` with strict 75% coverage thresholds for statements, branches, functions, and lines.
- **Local Diagnostics Tool:** Added `scripts/verify-setup.mjs` to dynamically verify Node.js version, project structure, entrypoints, and node_modules dependencies.
- **Developer Governance:** Created standard `CONTRIBUTING.md` guide and Keep-a-Changelog `CHANGELOG.md`.
- **Architectural ADR:** Added `docs/adr/0001-chord-detection-engine.md` to map out the chord detection DSP calculations and scoring heuristics.

### Changed
- **Security Remediation:** Upgraded development dependency packages to remediate high-severity CVEs:
  - Upgraded `vite` to `6.4.2` (Dev Server WebSocket and Path Traversal fix).
  - Upgraded `electron` to `39.8.10` (Chromium named window.open and offscreen texture fixes).
  - Upgraded `prettier` to `3.8.3` to match lockfile minor specs.
- **CI Enhancements:** Updated `.github/workflows/ci.yml` pipeline tasks to align with standard practices.

---

## [2.0.0] - 2026-03-19

### Added
- **Multi-Mode Chord Detection:** Introduced four dynamic chord detection presets (`lowcpu`, `normal`, `accurate`, `responsive`) adjusting FFT size, RMS gates, stability frame requirements, and hold timers.
- **Tuning Deviation Correction:** Implemented live tuning estimator checkingcents residuals relative to A440Hz and adapting chroma maps.
- **Custom Cover Art:** Added dynamic cover-art overriding in UI with fallback scanning and Drag & Drop image upload.
- **Cover Backdrop Wash:** Developed dynamic canvas color wash extraction that generates beautiful backdrops matching loaded artwork.
- **Video Playback & Overlays:** Integrated support for MP4/WEBM video media alongside custom control overlay bars and visual switching.
- **Saved Queue Management:** Added local queue serialization and modal interactions.

### Changed
- **Visualizer Engine:** Enhanced Particle and Spectrogram visualizer modes.
- **Audio Routing:** Connected time-domain analysers post-filters for clean RMS gating.

---

## [1.0.0] - 2026-01-10

### Added
- **Initial Release:** Core Electron application features:
  - Waveform visualizer canvas.
  - Basic file selection queue.
  - Metadata ID3 tags editor.
  - Peaking equalizer controls.
  - Light/Dark themes and titlebar control mappings.
