# CadencePlayer

CadencePlayer is an Electron-based music player with a built in visualizer and
real-time chord recognition. The detector now locks on to chords more quickly
and can recognize common sixth and 6/9 voicings. The chord display still dims
when confidence is low to avoid distracting flicker. The application now
remembers user preferences such as dark mode, volume level and chord detection
mode between sessions for a smoother listening experience.

Usage tips:
- Add files: click the Add button or drag-and-drop audio files into the window.
- Chords: click the music-note button to toggle; right-click it to cycle modes (Low-CPU, Responsive, Normal, Accurate).
- Diagnostics: press the D key to toggle a small diagnostics overlay.
- Shortcuts: Space to play/pause, arrows Left/Right to seek, Up/Down to adjust volume, S to toggle shuffle, R to toggle repeat.
