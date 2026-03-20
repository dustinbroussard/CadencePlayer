# Cadence Player Audit

Audit date: 2026-03-19
Auditor: Codex
Scope: full repository audit with extra focus on chord detection accuracy, functionality, and display responsiveness

## Executive Summary

Health score: 78/100

Project type:
- Electron desktop media player with local-file playback, waveform/visualizer rendering, metadata editing, and real-time chord detection

Primary stack:
- JavaScript, Electron, Vite, Vitest, ESLint, Prettier

Top 5 risks:
1. High: chord detection logic is concentrated in a 1073-line detector module with no real-audio regression corpus, so false positives and edge-case regressions are likely to escape synthetic FFT tests.
2. High: the renderer and chord detector together hold most product logic, which creates high change-risk and weak module boundaries.
3. Medium: repository process drift existed before this audit; the README claimed CI that was not actually present.
4. Medium: testing has no coverage thresholds, no end-to-end automation, and no performance regression harness for audio analysis.
5. Medium: bus factor is effectively 1 based on `git shortlog -sn --all`.

Recommended priorities:
1. Build a real-audio chord validation suite with labeled fixtures.
2. Split chord analysis into smaller units and add deterministic scoring fixtures.
3. Keep CI mandatory for lint, tests, and production build.
4. Add coverage reporting and a packaged-app smoke test.
5. Reduce renderer size by carving out playback UI, menus, and diagnostics modules.

Estimated effort:
- Quick wins: 8-16 hours
- Medium-term: 24-40 hours
- Long-term: 60-120 hours

## Audit Scope And Evidence

Project identification:
- Electron app entrypoint: `main.js`
- Preload bridge: `preload.js`
- Frontend bootstrap and UI orchestration: `src/js/renderer.js`
- Audio pipeline: `src/js/audio-manager.js`
- Chord analysis engine: `src/js/chord-detector.js`
- Build tooling: `package.json`, `vite.config.mjs`
- Tests: `test/*.test.js`
- CI after remediation: `.github/workflows/ci.yml`

Measured commands:
- `npm test`: 15/15 passing
- `npm run lint`: passing
- `npm audit --json`: 0 known vulnerabilities
- `npm run build`: success in 278 ms

## Findings By Severity

### High

#### 1. Chord detector correctness risk is under-tested

Evidence:
- `src/js/chord-detector.js` is 1073 lines and contains spectral feature extraction, tuning estimation, chroma projection, bass biasing, template matching, consensus, extension analysis, and inversion logic in one class.
- Tests cover only synthetic FFT frames, not recorded audio or live playback conditions: `test/chord-detector.test.js`
- Example scoring and extension logic spans `src/js/chord-detector.js:569-755`.

Impact:
- High probability of regressions in chord naming, extension detection, and mode-specific behavior on real songs.
- Synthetic tests do not validate attack transients, detuned instruments, compression artifacts, percussion bleed, or mixed arrangements.

Compliance:
- Misses the spirit of OWASP ASVS V14.2 and general release engineering expectations for critical-path automated verification.

Root cause:
- The detector evolved into a large heuristic engine without a ground-truth fixture suite.

Immediate fix:
- Added runtime refresh when chord mode changes so updated `chromaSigmaCents` and related analysis settings take effect immediately.

Long-term solution:
- Add labeled audio fixtures for single notes, triads, sevenths, extended chords, inversions, and noisy/full-mix excerpts.
- Separate chroma extraction, scoring, temporal smoothing, and naming into independently tested modules.

Migration path:
- Start by keeping the public callback shape stable and moving internal scoring logic behind small pure functions.

Risk assessment:
- Medium regression risk if refactored without golden fixtures.

Effort:
- 20-40 hours

#### 2. Renderer and detector are oversized coordination points

Evidence:
- `src/js/renderer.js`: 1562 lines
- `src/js/chord-detector.js`: 1073 lines
- `src/js/audio-manager.js`: 552 lines

Impact:
- Higher chance of shotgun surgery, accidental state coupling, and slow onboarding.

Compliance:
- Violates basic modularity and maintainability guidance from ISO/IEC 25010 maintainability characteristics.

Root cause:
- Feature growth accumulated in central classes instead of feature slices.

Immediate fix:
- None beyond small safe fixes in this audit.

Long-term solution:
- Extract renderer submodules:
  - menu/settings
  - queue persistence
  - chord readout/diagnostics
  - video overlay controls
- Extract detector submodules:
  - chroma extraction
  - spectral metrics
  - template scoring
  - extension/inversion naming

Migration path:
- Move pure logic first, then DOM/event code.

Risk assessment:
- Medium.

Effort:
- 24-48 hours

### Medium

#### 3. CI/documentation drift was real and would have hidden regressions

Evidence:
- `README.md:50-52` claimed a GitHub Actions workflow that was not checked in before this audit.
- `.github/workflows/` was absent before remediation.

Impact:
- Broken tests and lint drift could reach mainline unnoticed.

Immediate fix:
- Added `.github/workflows/ci.yml`
- Updated `README.md` to match reality

Long-term solution:
- Protect the default branch with required CI checks.

Risk assessment:
- Low after remediation.

Effort:
- 1-2 hours

#### 4. Chord display path had avoidable responsiveness overhead

Evidence:
- `src/js/renderer.js:116-143` updates the readout on every detector callback.
- Before remediation, each update queued a fresh `setTimeout` pulse removal, which could stack timers under fast detector updates.
- Before remediation, repeated detector start attempts could queue redundant `requestAnimationFrame` polling while waiting for playback.

Impact:
- UI jitter, unnecessary timer churn, and harder-to-reason-about detector startup behavior.

Immediate fix:
- Added pulse timeout reuse and a single pending-start RAF guard.

Long-term solution:
- Consider CSS animation restart via class toggling with one scheduler, or only pulse on chord-name transitions rather than every confidence update.

Risk assessment:
- Low.

Effort:
- 1-3 hours

#### 5. Test strategy lacks coverage, E2E, and performance baselines

Evidence:
- `package.json` has `test` but no coverage script.
- No Playwright, Spectron replacement, or packaged-app smoke test.
- No benchmark harness for detector latency or false-positive rate.

Impact:
- No automated protection against UI regressions, preload/main integration issues, or detector slowdowns.

Immediate fix:
- None in code.

Long-term solution:
- Add `vitest --coverage`
- Add a smoke test for packaged Electron boot and file selection IPC
- Add chord detector benchmark fixtures

Risk assessment:
- Medium.

Effort:
- 12-24 hours

#### 6. Bus factor is 1

Evidence:
- `git shortlog -sn --all` shows a single contributor.

Impact:
- Delivery and support risk if the maintainer is unavailable.

Long-term solution:
- Document release steps, architectural decisions, and detector heuristics.
- Require review by at least one secondary maintainer when available.

Effort:
- 6-12 hours

### Low

#### 7. `.gitignore` was incomplete

Evidence:
- `.gitignore` originally excluded only `.aider*` and `node_modules/`
- `dist/` was untracked in the working tree after build

Immediate fix:
- Added `dist/` and `coverage/`

#### 8. Headless dialog wrappers degraded test signal

Evidence:
- `safeAlert`, `safeConfirm`, and `safePrompt` previously called jsdom-not-implemented browser dialogs and relied on exception fallback.

Immediate fix:
- Added jsdom detection and clean fallback behavior.

## Phase Review

### Phase 1: Foundation And Context

Classification:
- Application
- Desktop app
- Local-file media tool

Metadata summary:
- License: MIT (`package.json`)
- Runtime deps: `music-metadata`, `node-id3`
- Dev deps: Electron, Vite, Vitest, ESLint, Prettier, supporting tooling
- Packaging: `electron-builder`
- CI/CD: GitHub Actions added in this audit
- Containers/IaC/Kubernetes/Terraform: not present

### Phase 2: Code Quality And Security

Static analysis:
- ESLint passes locally
- Vitest passes locally
- No TypeScript or static typing

Security posture:
- Good Electron defaults in `main.js:35-41`:
  - `contextIsolation: true`
  - `webSecurity: true`
  - `nodeIntegration: false`
  - `sandbox: true`
- Preload bridge is small and explicit: `preload.js:5-25`
- Navigation hardening present: `main.js:62-64`
- CSP present in `index.html:7`
- Secret scan: no findings
- `npm audit`: zero known vulnerabilities at audit time

Security checklist summary:
- SQL injection: not applicable
- XSS: low exposure because app is local, CSP is present, and there is no templated remote content path in scope
- CSRF: not applicable
- Auth/authz: not applicable
- IDOR: not applicable
- Sensitive data exposure: no committed env or key files found
- Hardcoded credentials: none found
- Command injection: none found in reviewed code
- Insecure deserialization: none identified
- API security: not applicable

### Phase 3: Architecture And Design

Observed patterns:
- Main/preload/renderer separation typical of Electron
- Service-style `AudioManager`
- Large orchestration `Renderer`
- Heuristic DSP engine for chord recognition

Anti-pattern signals:
- God Object tendencies in `Renderer`
- Big Ball of Mud risk forming around chord detector heuristics
- Feature accretion without modular isolation

Chord-specific assessment:
- Strengths:
  - dedicated analyser
  - adjustable FFT size by mode
  - RMS gating
  - tuning estimation
  - diagnostics overlay
- Weaknesses:
  - no corpus-backed validation
  - multiple heuristics interact without a calibrated benchmark
  - UI and detector timing were partly coupled through ad hoc timers until remediated

### Phase 4: Operational Excellence

DevOps:
- Build works locally
- Packaging config exists
- No release workflow, signing, or artifact publishing automation

Observability:
- Basic console/error flows only
- No structured logging, metrics, or tracing
- Diagnostics overlay is useful for local tuning but not persisted

Documentation:
- README covers install/run basics
- No ADRs
- No CONTRIBUTING guide
- No CHANGELOG
- Existing `docs/AUDIT.md` was stale before this audit and has been superseded

### Phase 5: Developer Experience

Strengths:
- Simple `npm install`, `npm test`, `npm run lint`, `npm run build`
- Small codebase footprint
- Reasonable unit-test coverage around queue operations and detector smoke cases

Gaps:
- No setup validation script
- No seed/sample media fixtures
- No pre-commit hooks
- No coverage thresholds

### Phase 6: Compliance And Governance

Licensing:
- Project license is MIT
- Direct dependencies appear license-compatible for MIT distribution
- No copyleft concern identified in direct runtime dependencies

GDPR/PII:
- No networked data collection path observed in the audited code

Ownership:
- Single visible maintainer

## Dependency Analysis

See `DEPENDENCIES.md` for the direct dependency matrix and upgrade guidance.

Summary:
- `npm audit --json`: 0 vulnerabilities
- `npm outdated --json`: several dev tools behind latest major releases
- Highest caution upgrade:
  - `electron-reload` remains on `2.0.0-alpha.1`; alpha dependency in dev tooling should be reviewed or replaced

## Repair Strategies

### Remediated During This Audit

1. Added direct `Renderer.getChordColors()` compatibility method to satisfy tests and preserve expected API behavior.
2. Added detector analysis refresh on mode changes so chord responsiveness/accuracy settings take effect immediately.
3. Removed timer/RAF churn in the chord display/startup path.
4. Hardened headless dialog fallbacks for tests.
5. Added `.gitignore` entries for generated artifacts.
6. Added CI workflow and aligned README.

### Recommended Next Repairs

1. Real-audio chord fixtures
   - Root cause: no ground-truth dataset
   - Immediate fix: add 10-20 short labeled clips
   - Long-term: benchmark precision/recall by mode
   - Risk: low
   - Effort: 12-20 hours

2. Detector decomposition
   - Root cause: heuristic accumulation
   - Immediate fix: extract pure scoring helpers first
   - Long-term: isolate DSP pipeline behind tests
   - Risk: medium
   - Effort: 24-40 hours

3. Coverage + smoke testing
   - Root cause: unit-only bias
   - Immediate fix: add coverage reporter and threshold
   - Long-term: packaged-app smoke tests
   - Risk: low
   - Effort: 8-16 hours

4. Docs/governance
   - Root cause: solo-maintainer velocity favored code over process
   - Immediate fix: add CONTRIBUTING and CHANGELOG
   - Long-term: ADRs for audio/chord strategy
   - Risk: low
   - Effort: 4-8 hours

## Cleaning Protocol

Recommended cleanup:
- Remove stale `dist/` outputs from versioned review context
- Break large renderer sections into modules
- Keep commented code minimal
- Add formatter/lint automation to pre-commit hooks
- Normalize naming around “analyser/analyzer” if the team wants a single convention

## Improvement Roadmap

Quick wins (1-3 days):
- Keep CI required on pull requests
- Add coverage reporting
- Add chord fixture tests
- Add CONTRIBUTING and CHANGELOG

Medium-term (1-2 weeks):
- Split detector into pure modules
- Split renderer into UI feature slices
- Add packaged-app smoke tests
- Add detector mode benchmark output

Long-term (1+ months):
- Introduce telemetry/benchmarking for chord detector quality
- Consider moving analysis-heavy logic to an AudioWorklet or worker-like boundary if CPU contention becomes visible
- Consider typed contracts for IPC and renderer state

## Verification And Validation

Completed:
- `npm test`
- `npm run lint`
- `npm audit --json`
- `npm run build`

Recommended regression commands:
- `npm run ci`
- `npm run build`

Rollback plan:
- Revert the audit patch set as one changeset if chord readout behavior regresses
- Keep detector mode refresh change isolated when testing future DSP refactors

Canary recommendation:
- Validate chord detection with 5-10 representative tracks before shipping any detector refactor
- Compare false-positive rate and time-to-first-chord by mode

