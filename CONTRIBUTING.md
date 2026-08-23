# Contributing to Cadence Player

Thank you for contributing to Cadence Player! This document contains guidelines and workflows to help you set up your local development environment and write high-quality contributions.

---

## 1. Repository Structure & Architectural Boundaries

Cadence Player is an Electron application. Its codebase is strictly separated into three execution contexts to preserve stability, sandboxing, and security:

* **Main Process (`main.js`):** Node.js environment. Manages native OS window lifecycle, filesystem integrations (drag-and-drop, path conversions), file tags (via `node-id3`/`music-metadata`), and app menus.
* **Preload Bridge (`preload.js`):** Secure context-isolated bridge. Exposes explicit, hardened, and sanitised RPC/IPC endpoints to the renderer window via `contextBridge.exposeInMainWorld('electronAPI')`.
* **Renderer Process (`src/js/renderer.js`):** Browser-like context. Orchestrates UI DOM events, modal interactions, equalizer controls, dynamic cover-art color wash extraction, and coordinates:
  * `AudioManager` (`src/js/audio-manager.js`): Manages Web Audio API node chaining (EQ, shelves, standard/chord analysers) and playlist/queue state.
  * `Visualizer` (`src/js/visualizer.js`): Renders custom canvas visualizers (Orb, Particles, Spectrogram, Bars, Waves).
  * `ChordDetector` (`src/js/chord-detector.js`): Heuristic DSP engine that computes real-time chords from spectral FFT data.

```
├── .github/workflows/    # CI pipelines
├── assets/               # App icons and graphics
├── docs/                 # Architectural decision records (ADRs)
├── scripts/              # Build, benchmark, and setup diagnostic scripts
├── src/
│   ├── css/              # Core stylesheets (styles.css)
│   └── js/
│       ├── ui/           # Shared UI helpers (presets, storage, color wash maps)
│       ├── audio-manager.js
│       ├── chord-detector.js
│       ├── cover-art-service.cjs
│       ├── renderer.js
│       └── visualizer.js
└── test/                 # Vitest regression unit/integration suites
```

---

## 2. Local Development Setup

### 2.1 Prerequisites
* **Node.js:** Version `18` or higher is required.
* **NPM:** Standard package manager.

### 2.2 Installation
Clone the repository and run the setup diagnostic:
```bash
# Install dependencies
npm install

# Run environment setup verification
node scripts/verify-setup.mjs
```

### 2.3 Running the App
Start Vite (asset compilation) and Electron concurrently:
```bash
npm run dev
```

### 2.4 Building & Packaging
To build the static production bundle or package the application:
```bash
# Build Vite production assets
npm run build

# Package application with electron-builder (creates local AppImage/NSIS package)
npm run dist
```

---

## 3. Coding Guidelines

### 3.1 Styling & Formatting
* **Linting:** We enforce ESLint v9+ flat configurations. Run `npm run lint` before committing. Use `npm run lint:fix` to auto-solve basic violations.
* **Formatting:** Code formatting is managed by Prettier. Run `npm run format` to standardise code style.
* **Comment Preservation:** Maintain all existing docstrings and comments. Document any non-obvious DSP heuristics or math formulas.

### 3.2 HTML & Accessibility (WCAG)
* Maintain strict accessibility boundaries:
  * All interactive elements must have unique, descriptive IDs and standard `aria-label` tags.
  * Form inputs must be correctly bound to their labels using `<label for="my-input">` and `<input id="my-input">`.
  * Maintain keyboard focus and trap focus inside modal overlays (`#metadata-modal`, `#queue-save-modal`) when active.

---

## 4. Testing & Coverage Policy

We use **Vitest** for our regression suites.

### 4.1 Running Tests
```bash
# Run all unit and mock tests
npm test

# Run tests in watch mode
npx vitest

# Run only chord detector benchmarks/fixtures
npm run test:chords
```

### 4.2 Code Coverage Thresholds
We enforce a strict **75% automated coverage threshold** on statements, branches, functions, and lines. Any modifications that drop coverage below this threshold will fail the CI check.
To check code coverage locally:
```bash
npm run test:coverage
```
Ensure your new features or refactored functions include corresponding unit tests under the `test/` directory to meet coverage requirements.
