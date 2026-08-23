import { getSavedQueues, setSavedQueues } from './ui/queue-storage.js';
import { safeAlert, safeConfirm, safePrompt } from './ui/utils.js';

export class QueueManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.audioManager = renderer.audioManager;
    this.queueCtx = null;
  }

  clearQueue() {
    this.audioManager.clearQueue();
    this.renderer.syncPlaybackUi(false);
    this.renderer.progressBar.value = 0;
    this.renderer.trackDurationEl.textContent = '';
    if (this.renderer.chordReadout) {
      this.renderer.chordReadout.textContent = '—';
      this.renderer.chordReadout.classList.add('dim');
      this.renderer.chordReadout.style.removeProperty('color');
      this.renderer.chordReadout.style.removeProperty('background');
      this.renderer.chordReadout.style.removeProperty('border-color');
    }
  }

  async addFiles() {
    const files = await window.electronAPI.selectAudioFiles();
    if (files.length > 0) {
      this.audioManager.addFilesToQueue(files);
    }
  }

  initDragAndDrop() {
    const dropZone = document.body;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      if (this.renderer.extractDroppedImagePath(e.dataTransfer)) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        return;
      }
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const allowed = new Set(['mp3','wav','ogg','m4a','flac','aac','mp4','m4v','webm']);
      const dropped = [...e.dataTransfer.files]
        .filter(f => {
          const ext = (f.name.split('.').pop()||'').toLowerCase();
          const mime = f.type || '';
          const isAudio = mime.startsWith('audio/');
          const isSupportedVideo = mime === 'video/mp4' || mime === 'video/x-m4v' || mime === 'video/webm';
          const isSupportedAudioWebM = mime === 'audio/webm';
          return isAudio || isSupportedVideo || isSupportedAudioWebM || allowed.has(ext);
        });

      if (dropped.length === 0) return;

      const paths = dropped.map(f => f.path).filter(Boolean);
      const normalized = await window.electronAPI.pathsToFileUrls(paths);
      if (normalized && normalized.length) this.audioManager.addFilesToQueue(normalized);
    });
  }

  renderQueue() {
    this.renderer.queueEl.innerHTML = '';
    this.audioManager.getQueue().forEach((track, index) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      if (index === this.audioManager.getCurrentIndex()) {
        li.classList.add('playing');
      }
      li.textContent = this.renderer.getDisplayName(track);
      li.dataset.index = index;
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = Number(li.dataset.index);
        if (!Number.isNaN(from) && !Number.isNaN(to)) {
          this.audioManager.moveTrack(from, to);
        }
      });
      li.addEventListener('click', () => {
        this.audioManager.playTrack(index);
        this.renderer.syncPlaybackUi(true);
      });
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showQueueContextMenu(e, index);
      });
      this.renderer.queueEl.appendChild(li);
    });
  }

  ensureQueueContextMenu() {
    if (this.queueCtx) return this.queueCtx;
    const menu = document.createElement('div');
    menu.id = 'queue-context-menu';
    menu.className = 'context-menu hidden';
    const optPlay = document.createElement('div'); optPlay.className = 'context-item'; optPlay.textContent = 'Play';
    const optPlayNext = document.createElement('div'); optPlayNext.className = 'context-item'; optPlayNext.textContent = 'Play next';
    const optEdit = document.createElement('div'); optEdit.className = 'context-item'; optEdit.textContent = 'Edit tags';
    const optReveal = document.createElement('div'); optReveal.className = 'context-item'; optReveal.textContent = 'Reveal in folder';
    const sep = document.createElement('div'); sep.className = 'context-separator';
    const optRemove = document.createElement('div'); optRemove.className = 'context-item destructive'; optRemove.textContent = 'Remove from queue';
    menu.appendChild(optPlay); menu.appendChild(optPlayNext); menu.appendChild(optEdit); menu.appendChild(optReveal); menu.appendChild(sep); menu.appendChild(optRemove);
    document.body.appendChild(menu);
    this.queueCtx = { el: menu, optPlay, optPlayNext, optReveal, optRemove, optEdit };
    return this.queueCtx;
  }

  showQueueContextMenu(e, index) {
    const ctx = this.ensureQueueContextMenu();
    const { el, optPlay, optPlayNext, optReveal, optRemove, optEdit } = ctx;
    const left = Number(e.clientX) || 0;
    const top = Number(e.clientY) || 0;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
    if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        el.style.left = `${Math.min(Math.max(margin, left), maxLeft)}px`;
        el.style.top = `${Math.min(Math.max(margin, top), maxTop)}px`;
      });
    }
    const off = () => this.hideQueueContextMenu();
    optPlay.onclick = () => { this.audioManager.playTrack(index); off(); };
    optPlayNext.onclick = () => { this.audioManager.moveTrackToNext(index); off(); };
    optReveal.onclick = () => { const t = this.audioManager.getQueue()[index]; if (t) window.electronAPI.revealInFolder(t.path); off(); };
    optRemove.onclick = () => { this.audioManager.removeTrackAt(index); off(); };
    optEdit.onclick = () => { this.renderer.openMetadataModalForIndex(index); off(); };
  }

  hideQueueContextMenu() {
    if (this.queueCtx?.el) this.queueCtx.el.classList.add('hidden');
  }

  saveQueueAs() {
    const name = safePrompt('Save queue as:', '');
    if (!name) return;
    const q = this.audioManager.getQueue().map(t => ({ path: t.path, name: t.name }));
    const all = getSavedQueues();
    all[name] = { items: q, savedAt: Date.now() };
    setSavedQueues(all);
  }

  openQueueSaveModal() {
    if (!this.renderer.queueSaveModal) return;
    this.renderer.queueNameInput.value = '';
    this.renderer.queueSaveModal.classList.remove('hidden');
    this.renderer.queueSaveModal.classList.remove('closing');
    this.renderer.queueSaveModal.setAttribute('aria-hidden', 'false');
    this.renderer.queueNameInput.focus();
  }

  initQueueSaveUi() {
    this.renderer.queueSaveModal = document.getElementById('queue-save-modal');
    this.renderer.queueNameInput = document.getElementById('queue-name-input');
    this.renderer.queueSaveConfirmBtn = document.getElementById('queue-save-confirm');
    this.renderer.queueSaveCancelBtn = document.getElementById('queue-save-cancel');
    if (!this.renderer.queueSaveModal) return;
    if (this.renderer.queueSaveCancelBtn) this.renderer.queueSaveCancelBtn.addEventListener('click', () => this.closeQueueSaveModal());
    this.renderer.queueSaveModal.addEventListener('click', (ev) => { if (ev.target === this.renderer.queueSaveModal) this.closeQueueSaveModal(); });
    if (this.renderer.queueSaveConfirmBtn) this.renderer.queueSaveConfirmBtn.addEventListener('click', () => this.saveQueueFromModal());
    if (this.renderer.queueNameInput) this.renderer.queueNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.saveQueueFromModal(); } });
  }

  closeQueueSaveModal() {
    if (!this.renderer.queueSaveModal) return;
    this.renderer.queueSaveModal.classList.add('closing');
    const onEnd = () => {
      this.renderer.queueSaveModal.classList.add('hidden');
      this.renderer.queueSaveModal.classList.remove('closing');
      this.renderer.queueSaveModal.setAttribute('aria-hidden', 'true');
      this.renderer.queueSaveModal.removeEventListener('animationend', onEnd, true);
    };
    this.renderer.queueSaveModal.addEventListener('animationend', onEnd, true);
  }

  saveQueueFromModal() {
    const name = (this.renderer.queueNameInput?.value || '').trim();
    if (!name) return;
    const all = getSavedQueues();
    if (all[name]) {
      const overwrite = safeConfirm(`A queue named "${name}" already exists. Overwrite?`, false);
      if (!overwrite) return;
    }
    const q = this.audioManager.getQueue().map(t => ({ path: t.path, name: t.name }));
    all[name] = { items: q, savedAt: Date.now() };
    setSavedQueues(all);
    this.closeQueueSaveModal();
  }

  async loadQueueByName(name) {
    const all = getSavedQueues();
    const entry = all[name];
    if (!entry || !Array.isArray(entry.items)) return;
    const paths = entry.items.map(i => i.path);
    let exists = [];
    try { exists = await window.electronAPI.checkPathsExist(paths); } catch { exists = paths.map(() => true); }
    const present = entry.items.filter((_, i) => exists[i]);
    const missing = entry.items.filter((_, i) => !exists[i]);
    if (missing.length) {
      safeAlert(`Some files could not be found and were skipped:\n\n` + missing.map(m => `• ${m.name}`).join('\n'));
    }
    this.audioManager.clearQueue();
    if (present.length) {
      const normalized = await window.electronAPI.pathsToFileUrls(present.map(i => i.path));
      await this.audioManager.addFilesToQueue(normalized);
    }
  }

  deleteSavedQueue(name) {
    const all = getSavedQueues();
    delete all[name];
    setSavedQueues(all);
  }
}
