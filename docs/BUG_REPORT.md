# Cadence Player — Bug Report & Fixes

Date: 2025-10-27

## Critical Failures Identified

1) Playback state drift when no track is loaded or when `play()` fails.
   - Symptom: UI switched to “playing” even when there was no media source or autoplay was blocked.
   - Fix: Guard playback actions when no track is loaded, resume `AudioContext` on play, and track real playback via media element events.

2) Invalid queue index when skipping with an empty queue or `currentIndex = -1`.
   - Symptom: `playNext()`/`playPrev()` could set `currentIndex` to an invalid value, leaving the player in a broken state.
   - Fix: Added queue-length guards and a safe default to start at index 0 only when tracks exist.

3) Progress UI stopped updating in “Video” visualization mode.
   - Symptom: When the visualizer canvas was hidden, time/progress no longer updated.
   - Fix: Decoupled progress updates from the canvas render loop so the UI updates in all modes.

4) Seek/volume operations accepted invalid values.
   - Symptom: NaN/undefined values could propagate into `currentTime` and gain.
   - Fix: Clamp and validate inputs before applying them.

## Patch Summary

- `src/js/audio-manager.js`
  - Added `AudioContext.resume()` on playback start.
  - Emitted playback state changes from media element events.
  - Guarded `playNext`/`playPrev`/`playTrack` for empty queues.
  - Hardened seek and volume value handling.

- `src/js/renderer.js`
  - Centralized playback UI sync to reflect real playback state.
  - Guarded play/pause/skip actions when no track exists.
  - Updated the render loop to keep progress UI in sync during video mode.

