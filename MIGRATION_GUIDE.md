# Migration Guide

No major platform migration is required from this audit.

## Recommended Incremental Migration Tracks

### 1. Toolchain

Move in one branch:
- ESLint 10
- `@eslint/js` 10
- `eslint-config-prettier` 10
- `globals` 17

Validation:
- `npm run lint`
- `npm test`

### 2. Test Stack

Move in one branch:
- Vitest 4
- jsdom 29

Validation:
- DOM-heavy renderer tests
- saved queue flows
- chord readout rendering

### 3. Electron/Vite

Move in one branch:
- Electron 41
- Vite 8

Validation:
- dev boot
- production build
- packaged app startup
- preload bridge
- media loading
- chord detection startup after playback begins

## Chord Detection Migration Safety Rules

When refactoring detector logic:
1. Keep callback payload shape stable.
2. Compare output against labeled audio fixtures before shipping.
3. Roll out one mode at a time if defaults change.

