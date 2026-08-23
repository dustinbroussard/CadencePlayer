export class VideoHandler {
  constructor(renderer) {
    this.renderer = renderer;
    this.audioManager = renderer.audioManager;
  }

  autoSwitchVisualizationForTrack(track) {
    try {
      const isVideo = !!(track && track.isVideo);
      const cur = this.renderer.getVizMode();
      if (isVideo && cur !== 'video') {
        this.renderer.prevNonVideoMode = cur === 'video' ? this.renderer.prevNonVideoMode : cur;
        this.renderer.setVizMode('video');
        this.renderer.updateVisualizationUi('video');
      } else if (!isVideo && cur === 'video') {
        const restore = this.renderer.prevNonVideoMode || 'orb';
        if (this.renderer.visualizer.setMode) this.renderer.visualizer.setMode(restore);
        this.renderer.setVizMode(restore);
        this.renderer.updateVisualizationUi(restore);
      }
    } catch { /* ignore */ }
  }

  initVideoOverlayHandlers() {
    if (!this.renderer.videoContainer) return;
    if (this.renderer._videoHandlersInit) return;
    this.renderer._videoHandlersInit = true;
    let overlayTimer = null;
    const showOverlay = () => {
      if (this.renderer.videoOverlay) this.renderer.videoOverlay.classList.remove('hidden');
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = setTimeout(() => {
        if (this.renderer.videoOverlay) this.renderer.videoOverlay.classList.add('hidden');
      }, 2000);
    };
    this.renderer.videoContainer.addEventListener('mousemove', showOverlay);
    this.renderer.videoContainer.addEventListener('dblclick', () => this.toggleFullscreen());
    this.renderer.videoContainer.addEventListener('click', (e) => {
      if (e.target === this.renderer.videoContainer) this.renderer.togglePlayback();
    });
    if (this.renderer.videoPlayPauseBtn) {
      this.renderer.videoPlayPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.renderer.togglePlayback(); });
    }
    if (this.renderer.videoSeek) {
      this.renderer.videoSeek.addEventListener('input', (e) => {
        const v = Number(e.target.value) || 0;
        this.renderer.seekTrack(v);
      });
    }
    if (this.renderer.videoModeChip) {
      this.renderer.videoModeChip.addEventListener('click', (e) => {
        e.stopPropagation();
        const restore = this.renderer.prevNonVideoMode || 'orb';
        if (this.renderer.visualizer.setMode) this.renderer.visualizer.setMode(restore);
        this.renderer.setVizMode(restore);
        this.renderer.updateVisualizationUi(restore);
        this.renderer.updateVideoModeUi();
      });
    }
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        (this.renderer.videoContainer || document.documentElement)?.requestFullscreen?.();
      }
    } catch { /* ignore */ }
  }

  updateVideoModeUi() {
    try {
      const mode = this.renderer.getVizMode();
      const isVideoMode = mode === 'video';
      const track = this.audioManager.getCurrentTrack && this.audioManager.getCurrentTrack();
      const isVideoTrack = !!(track && track.isVideo && track.audio && track.audio.tagName === 'VIDEO');
      const canvas = document.getElementById('visualizer');
      if (!this.renderer.videoContainer) return;

      if (isVideoMode && isVideoTrack) {
        if (canvas) canvas.classList.add('hidden');
        this.renderer.videoContainer.classList.remove('hidden');
        if (track.audio.parentElement !== this.renderer.videoContainer) {
          this.renderer.videoContainer.innerHTML = '';
          this.renderer.videoContainer.appendChild(track.audio);
        }
        track.audio.style.display = 'block';
        track.audio.style.width = '100%';
        track.audio.style.height = '100%';
        track.audio.removeAttribute('controls');
        track.audio.muted = false;
        if (this.renderer.videoChipText) {
          const label = (this.renderer.prevNonVideoMode || 'orb');
          const pretty = label[0].toUpperCase() + label.slice(1);
          this.renderer.videoChipText.textContent = `Back to ${pretty}`;
        }
      } else {
        if (canvas) canvas.classList.remove('hidden');
        this.renderer.videoContainer.classList.add('hidden');
        const vid = this.renderer.videoContainer.querySelector('video');
        if (vid) {
          vid.style.display = 'none';
        }
      }
    } catch { /* ignore */ }
  }
}
