import { BUILTIN_EQ_PRESETS, getCustomEqPresets, setCustomEqPresets } from './ui/eq-presets.js';

export class SettingsManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.audioManager = renderer.audioManager;
  }

  loadPreferences() {
    const dark = localStorage.getItem('darkMode');
    if (dark === 'true') {
      document.body.classList.add('dark-mode');
    }

    const vol = parseFloat(localStorage.getItem('volume'));
    if (!isNaN(vol)) {
      this.renderer.volumeSlider.value = vol;
      this.audioManager.setVolume(vol);
    }

    const savedChords = localStorage.getItem('chordsEnabled');
    if (savedChords === 'false') {
      this.renderer.chordsEnabled = false;
    }

    const savedMode = localStorage.getItem('chordMode');
    if (savedMode) {
      this.renderer.chordMode = savedMode;
    }

    const savedShuffle = localStorage.getItem('shuffle');
    const savedRepeat = localStorage.getItem('repeat');
    if (savedShuffle === 'true') {
      this.audioManager.setShuffle(true);
      this.renderer.shuffleBtn.classList.remove('inactive');
      this.renderer.repeatBtn.classList.add('inactive');
    }
    if (savedRepeat === 'true') {
      this.audioManager.setRepeat(true);
      this.renderer.repeatBtn.classList.remove('inactive');
      this.renderer.shuffleBtn.classList.add('inactive');
    }

    const viz = this.getVizMode();
    if (viz) {
      if (this.renderer.visualizer.setMode) this.renderer.visualizer.setMode(viz);
      this.renderer.updateVisualizationUi();
    }
    const theme = localStorage.getItem('vizTheme');
    if (theme && this.renderer.visualizer.setTheme) this.renderer.visualizer.setTheme(theme);
    const cfg = (() => { try { return JSON.parse(localStorage.getItem('vizConfig') || '{}'); } catch { return {}; } })();
    if (this.renderer.visualizer.setConfig && cfg) {
      Object.keys(cfg).forEach(mode => this.renderer.visualizer.setConfig(mode, cfg[mode]));
    }

    this.renderer.updateChordToggleUi();
  }

  getVizMode() {
    if (this.renderer._vizMode) return this.renderer._vizMode;
    const m = localStorage.getItem('vizMode') || 'orb';
    this.renderer._vizMode = m;
    return m;
  }

  setVizMode(mode) {
    const allowed = new Set(['orb', 'bars', 'wave', 'spectrogram', 'particles', 'cover', 'video']);
    const next = allowed.has(mode) ? mode : 'orb';
    this.renderer._vizMode = next;
    try { localStorage.setItem('vizMode', next); } catch { /* ignore */ }
    return next;
  }

  initEqControls() {
    const savedGains = (() => { try { return JSON.parse(localStorage.getItem('eqGains') || '[]'); } catch { return []; } })();
    this.audioManager.getFilters().forEach((filter, i) => {
      const container = document.createElement('div');
      container.className = 'slider-container';

      const label = document.createElement('label');
      label.textContent = filter.frequency.value < 1000 ? `${filter.frequency.value}Hz` : `${filter.frequency.value / 1000}kHz`;
      label.className = 'freq-label';
      label.setAttribute('for', `eq-slider-${i}`);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = `eq-slider-${i}`;
      slider.className = 'eq-slider';
      slider.min = -20;
      slider.max = 20;
      slider.step = 1;
      slider.value = (typeof savedGains[i] !== 'undefined') ? savedGains[i] : 0;
      slider.dataset.index = i;

      if (typeof savedGains[i] !== 'undefined') {
        this.audioManager.setEqGain(i, savedGains[i]);
      }

      slider.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        const val = Number(e.target.value);
        this.audioManager.setEqGain(idx, val);
        const arr = (() => { try { return JSON.parse(localStorage.getItem('eqGains') || '[]'); } catch { return []; } })();
        arr[idx] = val;
        localStorage.setItem('eqGains', JSON.stringify(arr));
      });

      container.appendChild(label);
      container.appendChild(slider);
      this.renderer.eqControls.appendChild(container);
      this.renderer.eqSliderEls[i] = slider;
    });
  }

  saveCustomEqPreset(name) {
    const gains = this.getCurrentEqGains();
    const all = getCustomEqPresets();
    all[name] = gains;
    setCustomEqPresets(all);
  }

  deleteCustomEqPreset(name) {
    const all = getCustomEqPresets();
    delete all[name];
    setCustomEqPresets(all);
  }

  getCurrentEqGains() {
    try { return this.audioManager.getFilters().map(f => Number(f.gain.value) || 0); } catch { return []; }
  }

  setEqGains(gains, persist) {
    if (!Array.isArray(gains)) return;
    gains.forEach((g, i) => {
      this.audioManager.setEqGain(i, g);
      if (this.renderer.eqSliderEls[i]) this.renderer.eqSliderEls[i].value = String(g);
    });
    if (persist) {
      localStorage.setItem('eqGains', JSON.stringify(gains));
    }
  }

  toggleEq() {
    this.renderer.eqControls.classList.toggle('hidden');
    this.renderer.toggleEqBtn.classList.toggle('active');
  }

  closeEq() {
    if (!this.renderer.eqControls.classList.contains('hidden')) {
      this.renderer.eqControls.classList.add('hidden');
      this.renderer.toggleEqBtn.classList.remove('active');
    }
  }

  toggleVizControls() {
    this.renderer.vizControls.classList.toggle('hidden');
    if (!this.renderer.vizControls.dataset.initialized) {
      this.initVizControls();
      this.renderer.vizControls.dataset.initialized = '1';
    }
  }

  closeVizControls() {
    if (!this.renderer.vizControls.classList.contains('hidden')) {
      this.renderer.vizControls.classList.add('hidden');
    }
  }

  maybeCloseFloatingPanels(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const clickedEq = path.includes(this.renderer.eqControls) || path.includes(this.renderer.toggleEqBtn);
    const clickedViz = path.includes(this.renderer.vizControls) || path.includes(this.renderer.visualSettingsBtn);
    if (!clickedEq) this.closeEq();
    if (!clickedViz) this.closeVizControls();
  }

  toggleDarkMode() {
    const enabled = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', enabled);
  }

  initVizControls() {
    const cfg = (() => { try { return JSON.parse(localStorage.getItem('vizConfig') || '{}'); } catch { return {}; } })();
    const theme = localStorage.getItem('vizTheme') || 'neon';
    const el = this.renderer.vizControls;
    el.innerHTML = '';
    
    const modeRow = document.createElement('div');
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Mode';
    modeLabel.style.marginRight = '8px';
    const modeSelect = document.createElement('select');
    modeSelect.id = 'viz-mode-select';
    modeLabel.setAttribute('for', modeSelect.id);
    ['orb','bars','wave','spectrogram','particles','cover','video'].forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m[0].toUpperCase() + m.slice(1);
      if (this.getVizMode() === m) opt.selected = true;
      modeSelect.appendChild(opt);
    });
    modeSelect.addEventListener('change', (e) => {
      const m = this.setVizMode(e.target.value);
      if (m !== 'video' && this.renderer.visualizer.setMode) this.renderer.visualizer.setMode(m);
      if (m !== 'video') this.renderer.prevNonVideoMode = m;
      this.renderer.updateVisualizationUi(m);
      this.renderer.updateVideoModeUi();
      if (m !== 'video') this.renderer.visualizer.draw();
    });
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSelect);
    el.appendChild(modeRow);

    const themeRow = document.createElement('div');
    themeRow.style.marginTop = '8px';
    const themeLabel = document.createElement('label');
    themeLabel.textContent = 'Theme';
    themeLabel.style.marginRight = '8px';
    const themeSelect = document.createElement('select');
    themeSelect.id = 'viz-theme-select';
    themeLabel.setAttribute('for', themeSelect.id);
    ['neon','sunset','aurora','ocean','mono'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t[0].toUpperCase() + t.slice(1);
      if (theme === t) opt.selected = true;
      themeSelect.appendChild(opt);
    });
    themeSelect.addEventListener('change', (e) => {
      const t = e.target.value;
      if (this.renderer.visualizer.setTheme) this.renderer.visualizer.setTheme(t);
      localStorage.setItem('vizTheme', t);
      if (this.getVizMode() !== 'video') this.renderer.visualizer.draw();
    });
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(themeSelect);
    el.appendChild(themeRow);

    let vizControlIndex = 0;
    const addSlider = (labelText, min, max, step, value, onInput) => {
      const row = document.createElement('div');
      row.style.marginTop = '8px';
      const label = document.createElement('label');
      label.textContent = labelText;
      label.style.marginRight = '8px';
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
      input.id = `viz-control-${vizControlIndex++}`;
      input.setAttribute('aria-label', `${labelText} setting`);
      label.setAttribute('for', input.id);
      input.addEventListener('input', (e) => onInput(Number(e.target.value)));
      row.appendChild(label);
      row.appendChild(input);
      el.appendChild(row);
    };

    const currentTrack = this.audioManager.getCurrentTrack();
    const hasTrack = !!currentTrack?.path;
    const hasCustomCover = !!(hasTrack && currentTrack?.meta?.coverArt?.source === 'override');
    const coverRow = document.createElement('div');
    coverRow.style.marginTop = '8px';
    const coverLabel = document.createElement('label');
    coverLabel.textContent = 'Cover Art';
    coverLabel.style.marginRight = '8px';
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'inline-btn';
    uploadBtn.textContent = hasCustomCover ? 'Replace Image' : 'Upload Image';
    uploadBtn.disabled = !hasTrack;
    uploadBtn.addEventListener('click', () => this.renderer.uploadCustomCoverArt());
    coverRow.appendChild(coverLabel);
    coverRow.appendChild(uploadBtn);
    if (hasCustomCover) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'inline-btn';
      removeBtn.style.marginLeft = '8px';
      removeBtn.textContent = 'Use Embedded';
      removeBtn.addEventListener('click', () => this.renderer.removeCustomCoverArt());
      coverRow.appendChild(removeBtn);
    }
    el.appendChild(coverRow);

    addSlider('Bars', 32, 256, 8, cfg?.bars?.count ?? 160, (val) => {
      const c = cfg.bars || (cfg.bars = {}); c.count = val;
      if (this.renderer.visualizer.setConfig) this.renderer.visualizer.setConfig('bars', { count: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    addSlider('Wave', 1, 6, 1, cfg?.wave?.thickness ?? 2, (val) => {
      const c = cfg.wave || (cfg.wave = {}); c.thickness = val;
      if (this.renderer.visualizer.setConfig) this.renderer.visualizer.setConfig('wave', { thickness: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    addSlider('Scroll', 1, 4, 1, cfg?.spectrogram?.speed ?? 1, (val) => {
      const c = cfg.spectrogram || (cfg.spectrogram = {}); c.speed = val;
      if (this.renderer.visualizer.setConfig) this.renderer.visualizer.setConfig('spectrogram', { speed: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    addSlider('Particles', 0, 2, 0.1, cfg?.particles?.intensity ?? 1, (val) => {
      const c = cfg.particles || (cfg.particles = {}); c.intensity = val;
      if (this.renderer.visualizer.setConfig) this.renderer.visualizer.setConfig('particles', { intensity: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    addSlider('Orb size', 0.2, 0.6, 0.02, cfg?.orb?.scale ?? 0.4, (val) => {
      const c = cfg.orb || (cfg.orb = {}); c.scale = val;
      if (this.renderer.visualizer.setConfig) this.renderer.visualizer.setConfig('orb', { scale: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });
  }
}
