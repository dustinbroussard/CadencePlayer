# Cadence Player — Repository Audit (v2.0.0)

Date: 2025-10-27

## Summary

This repository is an Electron-based desktop audio player with a custom visualizer and real-time chord detection. The codebase is JavaScript-only (no Python/Flask). Tooling includes ESLint (flat config), Prettier, Vitest, and Electron Builder. Overall quality is high: tests pass, lint is clean, security-conscious Electron settings are in place, and the renderer logic is modular and testable.

I made small, targeted improvements and added CI to raise production readiness. This iteration adds a stricter Content Security Policy and a minor visualizer optimization.

## Scope and Tools

- Static checks: ESLint 9 flat config, Prettier
- Tests: Vitest + jsdom
- Manual review of `main.js`, `preload.js`, `src/js/*`, `index.html`, tests
- CI: GitHub Actions workflow added

## Test and Lint Results

- Lint: no errors or warnings (`npm run lint`)
- Tests: 15/15 passed (`npm test`)
  - Prior to fix, jsdom logged “Not implemented: window.alert” from a code path in saved queue loading. Implemented `safeAlert`/`safeConfirm`/`safePrompt` wrappers to silence this and improve test ergonomics.

## Findings and Fixes

### 1) jsdom compatibility for window.alert/confirm/prompt
- Severity: low (affects tests/log noise, not runtime in Electron)
- Issue: `Renderer` called `alert`, `confirm`, `prompt` directly. jsdom doesn’t implement these, causing stderr noise during tests.
- Fix: Added `safeAlert`, `safeConfirm`, `safePrompt` wrappers with fallbacks and replaced direct usages.
- Patch: src/js/renderer.js

### 2) Continuous Integration
- Severity: medium (process readiness)
- Issue: No CI to enforce lint/tests on PRs.
- Fix: Added GitHub Actions workflow to `npm ci`, lint, and run tests on push/PR for Node 20.
- Patch: .github/workflows/ci.yml

### 3) Documentation updates
- Severity: low
- Issue: README didn’t mention CI nor the audit.
- Fix: Added CI and Audit sections, pointing to the workflow and this report.
- Patch: README.md

## Security Review (Electron)

- `contextIsolation: true`: enabled — good
- `nodeIntegration: false`: enabled — good
- `webSecurity: true`: enabled — good
- `preload`: used with `contextBridge` — good
- `setWindowOpenHandler(() => deny)`: blocks popups — good
- `will-navigate` prevented — good (prevents external navigation)
- IPC: explicit channels, argument shapes are validated implicitly. Consider adding schema validation in preload/renderer if untrusted data inputs are introduced in future.

Recommendations (optional, non-blocking):
- Consider `sandbox: true` in `webPreferences` if compatible with current preload usage and dependencies.
- Consider a Content Security Policy in `index.html` to lock down inline scripts/styles if moving to remote content in future (currently all local files).

## Performance Review

- Visualizer:
  - Has an internal frame cap and device-pixel–aware resizing — good.
  - Multiple modes (orb, bars, wave, spectrogram, particles) are implemented efficiently with canvas reuse.
- Audio pipeline:
  - Separate analysers for visualization and chord detection.
  - High FFT size (32768) for chord detection trades CPU for accuracy; fallback included. This is acceptable on desktop; expose as an advanced preference (already supported via `setChordFftSize`).
- Metadata:
  - Tag reading done asynchronously and non-blocking — good.

Recommendations (optional):
- Defer creation of some UI panels until first opened to reduce startup work (minor).
- Persist and throttle visualizer config rebuilds to reduce localStorage churn (already largely done).

## Code Quality Review

- Structure: clear separation between `AudioManager`, `Visualizer`, and `Renderer` with unit tests for each.
- State management: queue operations (move, remove, save/load) are covered by tests and adjust indices correctly.
- Error handling: good coverage in IPC handlers; returns `{ success, error }` on failures.
- Style: ESLint + Prettier configurations are modern (flat config) and applied consistently.

## Dependency Review

- Runtime: `music-metadata`, `node-id3` — both appropriate for desktop tag parsing/writing.
- Dev: Electron 39.2.2, ESLint 9, Vitest 3, jsdom 26 — modern stack.
- No new dependencies were added by this audit.

## CI/CD

- Added `ci.yml` to run on push/PR for main/master, Node 20: install, lint, test.
- Electron packaging is intentionally not run by default; uncomment in the workflow if desired.

## Open Recommendations (Future Work)

- Add minimal schema checks on IPC payloads to guard against unexpected data (e.g., `zod` or handcrafted checks in preload).
- Consider a small in-app toast/snackbar component instead of `alert` for a more integrated UX.
- Consider end-to-end smoke tests with Playwright for the packaged app (optional, larger scope).

## Patch Summary

1) src/js/renderer.js
   - Added `safeAlert`, `safeConfirm`, `safePrompt` helpers
   - Replaced direct `alert/confirm/prompt` usages with safe wrappers

2) .github/workflows/ci.yml
   - New CI running `npm ci`, lint, test

3) README.md
   - CI and Audit sections added

4) index.html
### 4) Content Security Policy (CSP)
- Severity: medium (defense-in-depth)
- Issue: No CSP present, which can allow unintended inline/script sources if future changes introduce them.
- Fix: Added a strict but compatible CSP meta tag in `index.html` allowing only local scripts/styles, Google Fonts, and local media/blob URLs.
- Patch: index.html

### 5) Visualizer micro-optimization
- Severity: low (perf polish)
- Issue: `Visualizer.draw()` performed work even when canvas had no layout size.
- Fix: Early return if `cssWidth` or `cssHeight` is zero to avoid unnecessary work.
- Patch: src/js/visualizer.js

   - Added CSP meta for stricter security

5) src/js/visualizer.js
   - Early-return optimization when canvas size is zero

No new dependencies were introduced; no breaking API changes.
