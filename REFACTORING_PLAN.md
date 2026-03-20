# Refactoring Plan

## Objective

Improve maintainability and chord-detection reliability without a big-bang rewrite.

## Phase 1: Stabilize Inputs And Verification

Goals:
- Add real-audio chord fixtures
- Add coverage reporting
- Keep CI mandatory

Tasks:
1. Add labeled clips for major, minor, seventh, suspended, power, and inversion cases.
2. Add detector assertions for time-to-lock and wrong-chord rejection.
3. Add `vitest --coverage` and fail under an initial threshold.

Estimate:
- 12-20 hours

## Phase 2: Split Large Modules

Goals:
- Reduce coordination complexity in `Renderer` and `ChordDetector`

Tasks:
1. Extract `chord-readout-controller.js`
2. Extract `app-menu-controller.js`
3. Extract detector helpers:
   - `spectral-features.js`
   - `chroma-map.js`
   - `chord-scoring.js`
   - `chord-naming.js`

Estimate:
- 24-40 hours

## Phase 3: Harden Runtime Behavior

Goals:
- Improve detector accuracy and responsiveness under realistic playback

Tasks:
1. Benchmark each chord mode against the fixture corpus.
2. Tune hold/confidence defaults based on measured false positives.
3. Consider moving heavy analysis work behind an AudioWorklet or similar isolation boundary if UI contention appears.

Estimate:
- 20-40 hours

## Phase 4: Governance And Onboarding

Goals:
- Reduce bus factor and process drift

Tasks:
1. Add `CONTRIBUTING.md`
2. Add `CHANGELOG.md`
3. Add a short ADR for the detector architecture and mode tradeoffs.

Estimate:
- 6-12 hours

