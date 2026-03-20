# Dependency Review

Audit date: 2026-03-19

## Direct Dependencies

| Package | Role | Current Installed | Wanted | Latest Seen | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| music-metadata | runtime | 11.12.3 | 11.12.3 | 11.12.3 | current | Core metadata parser |
| node-id3 | runtime | 0.2.9 | 0.2.9 | 0.2.9 | current | MP3 tag writes only |
| @eslint/js | dev | 9.39.4 | 9.39.4 | 10.0.1 | major behind | Upgrade with ESLint 10 plan |
| concurrently | dev | 9.2.1 | 9.2.1 | 9.2.1 | current | Dev workflow helper |
| electron | dev | 39.8.3 | 39.8.3 | 41.0.3 | major behind | Upgrade carefully due Chromium/Node shifts |
| electron-builder | dev | 26.8.1 | 26.8.1 | 26.8.1 | current | Packaging tool |
| electron-reload | dev | 2.0.0-alpha.1 | 2.0.0-alpha.1 | 2.0.0-alpha.1 | alpha | Consider replacement or pinning strategy |
| eslint | dev | 9.39.4 | 9.39.4 | 10.0.3 | major behind | Upgrade with config validation |
| eslint-config-prettier | dev | 9.1.2 | 9.1.2 | 10.1.8 | major behind | Low urgency |
| eslint-plugin-import | dev | 2.32.0 | 2.32.0 | 2.32.0 | current | No drift detected |
| globals | dev | 15.15.0 | 15.15.0 | 17.4.0 | major behind | Low risk |
| jsdom | dev | 26.1.0 | 26.1.0 | 29.0.0 | major behind | Expect test behavior changes |
| prettier | dev | 3.8.1 | 3.8.1 | 3.8.1 | current | Lockfile newer than manifest range |
| vite | dev | 6.4.1 | 6.4.1 | 8.0.1 | major behind | Check Electron/Vite compatibility before jump |
| vitest | dev | 3.2.4 | 3.2.4 | 4.1.0 | major behind | Upgrade with jsdom and snapshot review |

Source:
- `npm ls --depth=0 --json`
- `npm outdated --json`

## Security

Result:
- `npm audit --json`: 0 vulnerabilities

Notes:
- Zero known advisories is good, but it is not proof of supply-chain safety.
- `electron-reload` being alpha is the biggest trust/maintenance concern in the direct set.

## License Posture

Project license:
- MIT

Assessment:
- No direct dependency in the audited set raised an obvious copyleft conflict.
- Re-check transitive licenses if commercial redistribution requirements tighten.

## Upgrade Paths

### Safe now

- Keep runtime dependencies current with patch/minor releases.
- Keep `prettier`, `concurrently`, `electron-builder`, `eslint-plugin-import` current.

### Planned major upgrades

1. Toolchain track
   - `eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`
   - Validate flat config compatibility

2. Test track
   - `vitest`, `jsdom`
   - Re-run all DOM-heavy tests

3. Build/runtime track
   - `vite`
   - `electron`
   - Validate packaged app and preload bridge on each supported OS

### Packages To Reconsider

- `electron-reload@2.0.0-alpha.1`
  - Risk: alpha quality and slower maintenance expectations
  - Options:
    - keep if stable in practice
    - replace with `electronmon`, `nodemon`-based flow, or a simpler manual reload loop

