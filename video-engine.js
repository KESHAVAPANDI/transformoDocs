/* Local multi-clip video editor using Canvas + MediaRecorder. */
(() => {
  let clips = [], subtitles = [], activeClip = 0, exportUrl = null, subtitleUrl = null, audioGraph = null, projectId = null, projectName = '', projectDirty = false, restoringProject = false, transitionMode = 'cut';
  const root = () => document.querySelector('#video-editor-workspace');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function notify(message) {
    const toast = document.querySelector('#toast'); if (!toast) return;
    toast.textContent = message; toast.classList.add('show');
    clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function format(seconds) {
    if (!Number.isFinite(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function safeBase(name) { return name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'transformo-video'; }
  function close(force = false) {
    if (!force && projectDirty && !confirm('This video edit has unsaved changes. Leave without saving?')) return false;
    const workspace = root(); if (workspace) workspace.innerHTML = '';
    clips.forEach(clip => URL.revokeObjectURL(clip.url)); clips = []; subtitles = []; activeClip = 0;
    projectId = null; projectName = ''; projectDirty = false; restoringProject = false; transitionMode = 'cut';
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null;
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); subtitleUrl = null;
    if (audioGraph) { audioGraph.destination.stream.getTracks().forEach(track => track.stop()); audioGraph.context.close(); audioGraph = null; }
    document.removeEventListener('keydown', escape);
    document.querySelector('#videos-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  function escape(event) { if (event.key === 'Escape' && clips.length) close(); }
  function totalDuration() { return clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0); }
  function timelineOffset(index) { return clips.slice(0, index).reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0); }
  function timelineTime(index, sourceTime) { const clip = clips[index]; return clip ? timelineOffset(index) + Math.max(0, Math.min(clip.end - clip.start, sourceTime - clip.start)) : 0; }
  function subtitleAt(time) { return subtitles.find(cue => time >= cue.start && time < cue.end)?.text.trim() || ''; }
  function invalidateExports() {
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null;
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); subtitleUrl = null;
    const workspace = root();
    if (workspace) { const videoLink = workspace.querySelector('#download-video'), subtitleLink = workspace.querySelector('#download-subtitles'); if (videoLink) videoLink.hidden = true; if (subtitleLink) subtitleLink.hidden = true; }
    markProjectDirty();
  }
  function markProjectDirty() {
    if (restoringProject) return;
    projectDirty = true;
    const workspace = root(), button = workspace?.querySelector('#save-video-project'), status = workspace?.querySelector('#video-editor-status');
    if (button) button.textContent = projectId ? 'Save changes' : 'Save project';
    if (status) status.textContent = projectId ? 'Unsaved changes · save to update this project.' : 'Unsaved edit · save a local project to reopen it later.';
    updateTotals();
  }
  function updateSubtitlePreview(time = timelineTime(activeClip, root()?.querySelector('#source-video')?.currentTime || 0)) {
    const preview = root()?.querySelector('#subtitle-preview'); if (!preview) return;
    const value = subtitleAt(time); preview.textContent = value; preview.hidden = !value;
  }
  function renderSubtitles() {
    const list = root()?.querySelector('#subtitle-cues'); if (!list) return;
    list.innerHTML = subtitles.length ? subtitles.map((cue, index) => `<article class="subtitle-cue" data-subtitle-index="${index}"><header><strong>Cue ${String(index + 1).padStart(2, '0')}</strong><button type="button" data-subtitle-remove aria-label="Remove subtitle cue ${index + 1}">×</button></header><div class="subtitle-cue-times"><label>Start <input type="number" min="0" step="0.1" data-subtitle-field="start" value="${cue.start.toFixed(1)}" /></label><label>End <input type="number" min="0" step="0.1" data-subtitle-field="end" value="${cue.end.toFixed(1)}" /></label></div><textarea rows="2" data-subtitle-field="text" aria-label="Subtitle cue ${index + 1} text" placeholder="Type a subtitle…">${escapeHtml(cue.text)}</textarea></article>`).join('') : '<div class="subtitle-empty">Add a cue to place a subtitle on the timeline.</div>';
    const exportButton = root()?.querySelector('#export-srt'); if (exportButton) exportButton.disabled = !subtitles.some(cue => cue.text.trim());
    updateSubtitlePreview();
  }
  function addSubtitle() {
    const start = timelineTime(activeClip, root()?.querySelector('#source-video')?.currentTime || clips[activeClip]?.start || 0), end = Math.min(totalDuration(), start + 3);
    subtitles.push({ start, end: end > start ? end : start + 3, text: '' });
    invalidateExports(); renderSubtitles(); root()?.querySelector(`[data-subtitle-index="${subtitles.length - 1}"] textarea`)?.focus();
  }
  function updateSubtitle(event) {
    const field = event.target.closest('[data-subtitle-field]'), cue = field && subtitles[Number(field.closest('[data-subtitle-index]').dataset.subtitleIndex)]; if (!cue) return;
    cue[field.dataset.subtitleField] = field.dataset.subtitleField === 'text' ? field.value : Math.max(0, Number(field.value) || 0);
    invalidateExports(); updateSubtitlePreview();
    const exportButton = root()?.querySelector('#export-srt'); if (exportButton) exportButton.disabled = !subtitles.some(item => item.text.trim());
  }
  function removeSubtitle(event) {
    const button = event.target.closest('[data-subtitle-remove]'); if (!button) return;
    subtitles.splice(Number(button.closest('[data-subtitle-index]').dataset.subtitleIndex), 1); invalidateExports(); renderSubtitles();
  }
  function srtTimestamp(seconds) {
    const value = Math.max(0, Math.round(seconds * 1000)), hours = Math.floor(value / 3600000), minutes = Math.floor(value % 3600000 / 60000), secs = Math.floor(value % 60000 / 1000), millis = value % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }
  function parseSrtTimestamp(value) {
    const match = String(value).match(/^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, '0')) / 1000;
  }
  function parseSrt(source) {
    const blocks = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n+/), cues = []; let skipped = 0;
    for (const block of blocks) {
      const lines = block.split('\n'), timingIndex = lines.findIndex(line => /^\s*\d+:[0-5]\d:[0-5]\d[,.]\d{1,3}\s+-->\s+\d+:[0-5]\d:[0-5]\d[,.]\d{1,3}(?:\s+.*)?$/.test(line));
      if (timingIndex < 0) { if (lines.some(line => line.trim())) skipped++; continue; }
      const timing = lines[timingIndex].match(/^\s*(\d+:[0-5]\d:[0-5]\d[,.]\d{1,3})\s+-->\s+(\d+:[0-5]\d:[0-5]\d[,.]\d{1,3})/), start = parseSrtTimestamp(timing[1]), end = parseSrtTimestamp(timing[2]);
      const text = lines.slice(timingIndex + 1).join('\n').replace(/\\N/g, '\n').replace(/\{\\(?:an\d+|b\d*|i\d*|u\d*)\}/gi, '').replace(/<[^>]*>/g, '').trim();
      if (start === null || end === null || end <= start || !text) { skipped++; continue; }
      cues.push({ start, end, text });
    }
    cues.sort((a, b) => a.start - b.start || a.end - b.end);
    return { cues, skipped };
  }
  function subtitleSrt() {
    const duration = totalDuration();
    return subtitles.filter(cue => cue.text.trim() && cue.start < duration && Math.min(cue.end, duration) > cue.start).sort((a, b) => a.start - b.start).map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(Math.min(cue.end, duration))}\n${cue.text.trim()}`).join('\n\n');
  }
  function downloadSrt() {
    const srt = subtitleSrt();
    if (!srt) { notify('Add subtitle text within the timeline before exporting SRT.'); return; }
    const url = URL.createObjectURL(new Blob([srt], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `${safeBase(clips[0]?.file.name || 'transformo-video')}-subtitles.srt`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSrt(file) {
    if (!file) return;
    try {
      const result = parseSrt(await file.text());
      if (!result.cues.length) throw new Error('No valid subtitle cues were found. Use an SRT file with numbered cues and timecodes.');
      subtitles = result.cues; invalidateExports(); renderSubtitles();
      const outside = subtitles.filter(cue => cue.start >= totalDuration()).length;
      notify(`Imported ${subtitles.length} subtitle cue${subtitles.length === 1 ? '' : 's'}${result.skipped ? ` · skipped ${result.skipped} invalid block${result.skipped === 1 ? '' : 's'}` : ''}${outside ? ` · ${outside} start beyond the timeline` : ''}.`);
    } catch (error) { notify(error.message || 'Could not read that SRT file.'); }
  }
  async function addClips(files, clipSettings = []) {
    const candidates = [...files].filter(file => file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file.name));
    const added = [];
    for (const [index, file] of candidates.entries()) {
      const setting = clipSettings[index] || {}, clip = { file, url: URL.createObjectURL(file), duration: 0, start: 0, end: 0, fileId: setting.fileId || window.TransformoWorkspaceFiles?.idFor(file) };
      clips.push(clip);
      try {
        const duration = await readDuration(clip.url);
        clip.duration = duration;
        clip.start = Math.max(0, Math.min(duration, Number(setting.start) || 0));
        clip.end = setting.end === undefined ? duration : Math.max(0, Math.min(duration, Number(setting.end) || duration));
        if (clip.end <= clip.start) { clip.start = 0; clip.end = duration; }
        added.push(clip);
      } catch { clips.pop(); URL.revokeObjectURL(clip.url); notify(`Could not read ${file.name}. Try an MP4 or WebM file.`); }
    }
    if (clips.length) {
      invalidateExports();
      activeClip = Math.min(activeClip, clips.length - 1);
      renderTimeline(); await showClip(activeClip); updateTotals();
    }
    if (clipSettings.length) {
      restoringProject = false;
      projectDirty = projectDirty || clips.length !== clipSettings.length;
      const status = root()?.querySelector('#video-editor-status');
      if (status) status.textContent = projectDirty ? 'Unsaved changes · save to update this project.' : `Saved locally · ${projectName}`;
      updateTotals();
    }
    return added.map(clip => clip.file);
  }
  function readDuration(url) {
    return new Promise((resolve, reject) => {
      const probe = document.createElement('video'); probe.preload = 'metadata'; probe.muted = true; probe.src = url;
      probe.onloadedmetadata = () => { const duration = probe.duration; probe.removeAttribute('src'); probe.load(); Number.isFinite(duration) ? resolve(duration) : reject(new Error('Invalid duration')); };
      probe.onerror = () => reject(new Error('Unsupported video'));
    });
  }
  function editor(files, savedProject = null) {
    if (!close()) return false;
    const initialFiles = files ? (typeof files[Symbol.iterator] === 'function' && !files.name ? [...files] : [files]) : [];
    projectId = savedProject?.id || null; projectName = savedProject?.name || initialFiles[0]?.name.replace(/\.[^.]+$/, '') || 'Untitled video edit'; projectDirty = false; restoringProject = !!savedProject; transitionMode = savedProject?.transitionMode === 'fade' ? 'fade' : 'cut';
    subtitles = (savedProject?.subtitles || []).map(cue => ({ start: Number(cue.start) || 0, end: Number(cue.end) || 0, text: String(cue.text || '') }));
    const workspace = root(); if (!workspace) return;
    workspace.innerHTML = `<section class="video-editor glass-panel" id="video-editor" aria-labelledby="video-editor-title">
      <header class="video-editor-header"><div><div class="eyebrow"><span class="live-dot video-dot"></span> LOCAL VIDEO EDITOR</div><h2 id="video-editor-title">Your video timeline</h2><p>Arrange clips, set in and out points, then export one sequence.</p></div><div class="video-project-header-actions"><label class="video-project-name-field"><span>PROJECT NAME</span><input id="video-project-name" type="text" maxlength="80" value="${escapeHtml(projectName)}" aria-label="Video project name" /></label><button class="secondary-button" id="save-video-project" type="button" disabled>${projectId ? 'Save changes' : 'Save project'}</button><button class="video-back-button" id="video-editor-close" type="button">← Back to projects</button></div></header>
      <div class="video-editor-grid"><div class="video-stage"><video id="source-video" controls playsinline></video><canvas id="render-canvas" width="1280" height="720" hidden></canvas><div id="subtitle-preview" class="subtitle-preview" hidden></div></div>
       <aside class="video-inspector"><div class="inspector-label">CLIP TRIM</div><div class="active-clip-name" id="active-clip-name">Select a timeline clip</div><div class="trim-fields"><label>In <input id="trim-start" type="number" min="0" step="0.1" value="0" /></label><label>Out <input id="trim-end" type="number" min="0" step="0.1" value="0" /></label></div><div class="inspector-label transition-label">BETWEEN CLIPS</div><div class="video-transition-options" role="group" aria-label="Clip transition"><button type="button" data-transition-mode="cut" aria-pressed="${transitionMode === 'cut'}" class="${transitionMode === 'cut' ? 'selected' : ''}">Hard cut</button><button type="button" data-transition-mode="fade" aria-pressed="${transitionMode === 'fade'}" class="${transitionMode === 'fade' ? 'selected' : ''}">Fade through black</button></div>
      <div class="inspector-label caption-label">SUBTITLE TRACK</div><div class="subtitle-track-tools"><button class="secondary-button" id="import-srt" type="button">Import SRT</button><input id="srt-input" type="file" accept=".srt,application/x-subrip,text/plain" hidden /><button class="secondary-button" id="export-srt" type="button" disabled>Export SRT</button><button class="secondary-button" id="add-subtitle" type="button">＋ Add cue</button><button class="secondary-button" id="translate-caption" type="button">Translate track</button></div><input id="caption-source-language" type="hidden" value="${escapeHtml(savedProject?.captionSourceLanguage || 'en')}" /><div class="caption-language-heading">Translate from</div><div class="caption-language-options" role="group" aria-label="Subtitle source language"><button type="button" class="selected" data-caption-source="en" aria-pressed="true">English</button><button type="button" data-caption-source="es" aria-pressed="false">Español</button><button type="button" data-caption-source="fr" aria-pressed="false">Français</button><button type="button" data-caption-source="ja" aria-pressed="false">日本語</button><button type="button" data-caption-source="hi" aria-pressed="false">हिन्दी</button><button type="button" data-caption-source="ta" aria-pressed="false">தமிழ்</button><button type="button" data-caption-source="de" aria-pressed="false">Deutsch</button><button type="button" data-caption-source="zh" aria-pressed="false">中文</button><button type="button" data-caption-source="ko" aria-pressed="false">한국어</button><button type="button" data-caption-source="ar" aria-pressed="false">العربية</button></div><input id="caption-language" type="hidden" value="${escapeHtml(savedProject?.captionTargetLanguage || 'es')}" /><div class="caption-language-heading">Translate to</div><div class="caption-language-options" role="group" aria-label="Subtitle target language"><button type="button" data-caption-language="es" aria-pressed="true">Español</button><button type="button" data-caption-language="fr" aria-pressed="false">Français</button><button type="button" data-caption-language="ja" aria-pressed="false">日本語</button><button type="button" data-caption-language="hi" aria-pressed="false">हिन्दी</button><button type="button" data-caption-language="ta" aria-pressed="false">தமிழ்</button><button type="button" data-caption-language="de" aria-pressed="false">Deutsch</button><button type="button" data-caption-language="zh" aria-pressed="false">中文</button><button type="button" data-caption-language="ko" aria-pressed="false">한국어</button><button type="button" data-caption-language="ar" aria-pressed="false">العربية</button></div><div class="caption-translation-modes" role="group" aria-label="Subtitle translation method"><button type="button" class="selected" data-caption-mode="smart" aria-pressed="true">Smart · local first</button><button type="button" data-caption-mode="online" aria-pressed="false">DeepL online</button></div><label class="caption-cloud-consent"><input type="checkbox" id="caption-cloud-consent" /><span>DeepL Developer includes 1 million free characters total, not monthly; other plans may be paid. Subtitle text is sent only when you allow DeepL and start translation.</span></label><div id="subtitle-cues" class="subtitle-cues"></div>
      <div class="inspector-note">SRT timestamps use seconds on the combined timeline. Cues outside the timeline are left out of export.</div><button class="primary-button" id="export-video" type="button">Export timeline <span>↗</span></button><a id="download-video" class="video-download" hidden>Download edited video ↓</a><a id="download-subtitles" class="video-download subtitle-download" hidden>Download subtitles (.srt) ↓</a><div id="video-editor-status" class="video-editor-status">${projectId ? `Reopening ${escapeHtml(projectName)}…` : 'Add clips and save this timeline as a local project.'}</div></aside></div>
      <section class="timeline-panel" aria-label="Video timeline"><div class="timeline-heading"><div><strong>Timeline</strong><span id="timeline-summary">0 clips · 00:00</span></div><button class="secondary-button" id="video-add-clips" type="button">＋ Add clips</button><input id="timeline-input" type="file" accept="video/*" multiple hidden /></div><div class="timeline-ruler"><span>00:00</span><div><i></i><i></i><i></i><i></i><i></i></div><span id="timeline-duration">00:00</span></div><div class="timeline-clips" id="timeline-clips"></div></section>
      <div class="video-timeline"><span>◷</span><div class="timeline-rail"><div class="timeline-fill"></div></div><span id="video-current-time">00:00</span><span class="timeline-divider">/</span><span id="video-duration">00:00</span></div>
    </section>`;
    const sourceLanguage = workspace.querySelector('#caption-source-language').value, targetLanguage = workspace.querySelector('#caption-language').value;
    workspace.querySelectorAll('[data-caption-source]').forEach(button => { const selected = button.dataset.captionSource === sourceLanguage; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    workspace.querySelectorAll('[data-caption-language]').forEach(button => { const selected = button.dataset.captionLanguage === targetLanguage; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    const video = workspace.querySelector('#source-video');
    video.addEventListener('loadedmetadata', () => { if (!clips[activeClip]) return; video.currentTime = clips[activeClip].start; });
    video.addEventListener('timeupdate', () => {
      workspace.querySelector('#video-current-time').textContent = format(video.currentTime);
      const clip = clips[activeClip], span = clip ? Math.max(.1, clip.end - clip.start) : 0;
      workspace.querySelector('.timeline-fill').style.width = `${clip ? Math.min(100, Math.max(0, (video.currentTime - clip.start) / span * 100)) : 0}%`;
      updateSubtitlePreview();
    });
    workspace.querySelector('#video-editor-close').addEventListener('click', () => close());
    workspace.querySelector('#video-project-name').addEventListener('input', event => { restoringProject = false; projectName = event.target.value; markProjectDirty(); });
    workspace.querySelector('#save-video-project').addEventListener('click', saveProject);
    workspace.querySelector('#video-add-clips').addEventListener('click', () => workspace.querySelector('#timeline-input').click());
    workspace.querySelector('#timeline-input').addEventListener('change', async event => { try { const added = await addClips(event.target.files); if (added.length && window.TransformoWorkspaceFiles?.add) { await window.TransformoWorkspaceFiles.add(added, 'video'); for (const clip of clips) clip.fileId = window.TransformoWorkspaceFiles.idFor(clip.file) || clip.fileId; updateTotals(); } } catch (error) { notify(error.message || 'Could not add those clips.'); } event.target.value = ''; });
    workspace.querySelector('#timeline-clips').addEventListener('click', timelineAction);
    workspace.querySelector('#trim-start').addEventListener('change', updateTrim);
    workspace.querySelector('#trim-end').addEventListener('change', updateTrim);
    workspace.querySelectorAll('[data-transition-mode]').forEach(button => button.addEventListener('click', () => {
      transitionMode = button.dataset.transitionMode;
      workspace.querySelectorAll('[data-transition-mode]').forEach(option => { const selected = option === button; option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected)); });
      invalidateExports();
    }));
    workspace.querySelector('#add-subtitle').addEventListener('click', addSubtitle);
    workspace.querySelector('#subtitle-cues').addEventListener('input', updateSubtitle);
    workspace.querySelector('#subtitle-cues').addEventListener('click', removeSubtitle);
    workspace.querySelector('#import-srt').addEventListener('click', () => workspace.querySelector('#srt-input').click());
    workspace.querySelector('#srt-input').addEventListener('change', async event => { await importSrt(event.target.files?.[0]); event.target.value = ''; });
    workspace.querySelector('#export-srt').addEventListener('click', downloadSrt);
    workspace.querySelector('#translate-caption').addEventListener('click', translateCaption);
    workspace.querySelectorAll('[data-caption-mode]').forEach(button => button.addEventListener('click', () => {
      workspace.querySelectorAll('[data-caption-mode]').forEach(option => { const selected = option === button; option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected)); });
    }));
    workspace.querySelectorAll('[data-caption-source]').forEach(button => button.addEventListener('click', () => { workspace.querySelector('#caption-source-language').value = button.dataset.captionSource; workspace.querySelectorAll('[data-caption-source]').forEach(option => { const selected = option === button; option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected)); }); markProjectDirty(); }));
    workspace.querySelectorAll('[data-caption-language]').forEach(button => button.addEventListener('click', () => {
      workspace.querySelector('#caption-language').value = button.dataset.captionLanguage;
      workspace.querySelectorAll('[data-caption-language]').forEach(option => { const selected = option === button; option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected)); }); markProjectDirty();
    }));
    workspace.querySelector('#export-video').addEventListener('click', exportVideo);
    renderSubtitles();
    document.addEventListener('keydown', escape);
    addClips(initialFiles, savedProject?.clips || []).catch(error => notify(error.message || 'Could not load the selected clips.'));
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  async function showClip(index) {
    if (!clips[index]) return;
    activeClip = index;
    const workspace = root(), video = workspace?.querySelector('#source-video'); if (!video) return;
    const clip = clips[index]; video.pause();
    if (video.src !== clip.url) {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error(`Could not preview ${clip.file.name}.`));
        video.src = clip.url; video.load();
      });
    }
    video.currentTime = clip.start;
    updateSubtitlePreview();
    workspace.querySelector('#active-clip-name').textContent = clip.file.name;
    workspace.querySelector('#trim-start').value = clip.start.toFixed(1); workspace.querySelector('#trim-start').max = clip.duration;
    workspace.querySelector('#trim-end').value = clip.end.toFixed(1); workspace.querySelector('#trim-end').max = clip.duration;
    workspace.querySelector('#video-duration').textContent = format(clip.duration);
    renderTimeline();
  }
  function renderTimeline() {
    const workspace = root(), list = workspace?.querySelector('#timeline-clips'); if (!list) return;
    list.innerHTML = clips.map((clip, index) => `<article class="timeline-clip ${index === activeClip ? 'active' : ''}" data-clip-index="${index}"><button class="timeline-clip-main" data-timeline-action="select" type="button"><span class="timeline-clip-mark">${String(index + 1).padStart(2, '0')}</span><span class="timeline-clip-copy"><strong>${escapeHtml(clip.file.name)}</strong><small>${format(clip.start)} – ${format(clip.end)} · ${format(Math.max(0, clip.end - clip.start))}</small></span></button><div class="timeline-clip-actions"><button type="button" data-timeline-action="up" aria-label="Move clip up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-timeline-action="down" aria-label="Move clip down" ${index === clips.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-timeline-action="remove" aria-label="Remove clip">×</button></div></article>`).join('') || '<div class="timeline-empty">Add two or more clips to build a sequence, or start with one.</div>';
    updateTotals();
  }
  function timelineAction(event) {
    const button = event.target.closest('[data-timeline-action]'), card = button?.closest('[data-clip-index]'); if (!button || !card) return;
    const index = Number(card.dataset.clipIndex), action = button.dataset.timelineAction;
    if (action === 'select') { showClip(index).catch(error => notify(error.message)); return; }
    if (action === 'remove') { invalidateExports(); const selectedClip = clips[activeClip], [removed] = clips.splice(index, 1); URL.revokeObjectURL(removed.url); activeClip = clips.indexOf(selectedClip); if (activeClip < 0) activeClip = Math.max(0, Math.min(index, clips.length - 1)); renderTimeline(); if (clips.length) showClip(activeClip).catch(error => notify(error.message)); else { const video = root()?.querySelector('#source-video'), label = root()?.querySelector('#active-clip-name'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } if (label) label.textContent = 'Select a timeline clip'; } return; }
    const next = action === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= clips.length) return;
    invalidateExports(); [clips[index], clips[next]] = [clips[next], clips[index]];
    if (activeClip === index) activeClip = next; else if (activeClip === next) activeClip = index;
    renderTimeline(); showClip(activeClip).catch(error => notify(error.message));
  }
  function updateTrim() {
    const clip = clips[activeClip], workspace = root(); if (!clip || !workspace) return;
    const start = Math.max(0, Math.min(clip.duration, Number(workspace.querySelector('#trim-start').value) || 0));
    const end = Math.max(0, Math.min(clip.duration, Number(workspace.querySelector('#trim-end').value) || clip.duration));
    invalidateExports(); clip.start = start; clip.end = end;
    workspace.querySelector('#trim-start').value = start.toFixed(1); workspace.querySelector('#trim-end').value = end.toFixed(1);
    if (end > start) workspace.querySelector('#source-video').currentTime = start;
    renderTimeline();
  }
  function updateTotals() {
    const workspace = root(); if (!workspace) return;
    const count = clips.length, duration = totalDuration();
    const summary = workspace.querySelector('#timeline-summary'); if (summary) summary.textContent = `${count} clip${count === 1 ? '' : 's'} · ${format(duration)}`;
    const total = workspace.querySelector('#timeline-duration'); if (total) total.textContent = format(duration);
    const button = workspace.querySelector('#export-video'), exportFormat = window.MediaRecorder ? window.TransformoVideoExportFormat.selectVideoExportFormat(type => MediaRecorder.isTypeSupported(type)) : null;
    if (button) { button.disabled = !count || clips.some(clip => clip.end <= clip.start) || !exportFormat; button.innerHTML = exportFormat ? `Export ${exportFormat.extension.toUpperCase()} timeline <span>↗</span>` : 'Video export unavailable'; }
    const save = workspace.querySelector('#save-video-project'); if (save) save.disabled = !count || clips.some(clip => !clip.duration || !(clip.fileId || window.TransformoWorkspaceFiles?.idFor(clip.file)));
  }
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/), rows = []; let row = '';
    for (const word of words) { const next = row ? `${row} ${word}` : word; if (row && ctx.measureText(next).width > maxWidth) { rows.push(row); row = word; } else row = next; }
    if (row) rows.push(row); return rows;
  }
  async function translateCaption() {
    const workspace = root(), button = workspace?.querySelector('#translate-caption'), cues = subtitles.filter(cue => cue.text.trim());
    if (!cues.length) { notify('Add subtitle text before translating the track.'); return; }
    button.disabled = true; button.textContent = 'Checking language…';
    try {
      const targetLanguage = workspace.querySelector('#caption-language').value, mode = workspace.querySelector('[data-caption-mode].selected')?.dataset.captionMode || 'smart', allowOnline = !!workspace.querySelector('#caption-cloud-consent').checked;
      const sourceLanguage = workspace.querySelector('#caption-source-language').value, translations = await window.DocumentEngine.translateTextBlocks(cues.map(cue => cue.text), sourceLanguage, targetLanguage, (done, total, detail) => { button.textContent = detail?.stage === 'download' ? `Preparing local model · ${Math.round(detail.progress * 100)}%` : detail?.stage === 'fallback' ? 'Switching to DeepL…' : detail?.stage === 'online' ? `Translating online · ${done}/${total}` : `Translating locally · ${done}/${total}`; }, { mode, allowOnline });
      cues.forEach((cue, index) => { cue.text = translations[index]; });
      invalidateExports(); renderSubtitles(); notify('Translated subtitle track is ready to review.');
    } catch (error) { notify(error.message || 'Translation could not start.'); }
    finally { button.disabled = false; button.textContent = 'Translate track'; }
  }
  function loadVideo(video, clip) {
    if (video.src === clip.url && video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error(`Could not load ${clip.file.name} for export.`));
      video.src = clip.url; video.load();
    });
  }
  function seekVideo(video, time) {
    if (!video.seeking && Math.abs(video.currentTime - time) < .02) return Promise.resolve();
    return new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time; });
  }
  function getAudioGraph(video) {
    if (audioGraph) return audioGraph;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || (!video.captureStream && !video.mozCaptureStream)) return null;
    try {
      const context = new AudioContextClass(), source = context.createMediaElementSource(video), destination = context.createMediaStreamDestination(), monitor = context.createGain();
      monitor.gain.value = 0; source.connect(destination); source.connect(monitor); monitor.connect(context.destination);
      audioGraph = { context, destination, monitor }; return audioGraph;
    } catch { return null; }
  }
  async function exportVideo() {
    const workspace = root(), video = workspace?.querySelector('#source-video'), canvas = workspace?.querySelector('#render-canvas'); if (!video || !canvas || !clips.length) return;
    if (!window.MediaRecorder || !canvas.captureStream) { notify('Video export is not supported in this browser. Try a recent Chrome or Edge.'); return; }
    let exportFormat = window.TransformoVideoExportFormat.selectVideoExportFormat(type => MediaRecorder.isTypeSupported(type));
    if (!exportFormat) { notify('This browser does not report support for MP4 or WebM recording.'); return; }
    const exportClips = clips.map(clip => ({ ...clip })), exportTransitionMode = transitionMode;
    if (exportClips.some(clip => clip.end <= clip.start)) { notify('Each clip needs an out point after its in point.'); return; }
    const button = workspace.querySelector('#export-video'), status = workspace.querySelector('#video-editor-status'), subtitleLink = workspace.querySelector('#download-subtitles');
    if (subtitles.some(cue => cue.end <= cue.start)) { notify('Each subtitle cue needs an end time after its start time.'); return; }
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null;
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); subtitleUrl = null;
    workspace.querySelector('#download-video').hidden = true; subtitleLink.hidden = true;
    button.disabled = true; status.textContent = 'Preparing a local timeline render…';
    let stream, recorder, graph;
    try {
      graph = getAudioGraph(video); if (graph) await graph.context.resume();
      const first = exportClips[0]; await loadVideo(video, first); await seekVideo(video, first.start);
      const context = canvas.getContext('2d'); stream = canvas.captureStream(30);
      const audioTracks = graph?.destination.stream.getAudioTracks() || (video.captureStream?.() || video.mozCaptureStream?.())?.getAudioTracks() || [];
      audioTracks.forEach(track => stream.addTrack(track));
      try { recorder = new MediaRecorder(stream, { mimeType: exportFormat.mimeType }); }
      catch (error) {
        const fallback = window.TransformoVideoExportFormat.selectVideoExportFormat(type => type.startsWith('video/webm') && MediaRecorder.isTypeSupported(type));
        if (!fallback || fallback.mimeType === exportFormat.mimeType) throw error;
        exportFormat = fallback; recorder = new MediaRecorder(stream, { mimeType: exportFormat.mimeType });
      }
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const finished = new Promise((resolve, reject) => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })); recorder.onerror = () => reject(new Error('The browser could not finish the video render.')); });
      const draw = (timelinePosition = 0, transitionAlpha = 0) => {
        const w = canvas.width, h = canvas.height; context.fillStyle = '#111'; context.fillRect(0, 0, w, h);
        if (video.readyState >= 2 && video.videoWidth) { const scale = Math.min(w / video.videoWidth, h / video.videoHeight), dw = video.videoWidth * scale, dh = video.videoHeight * scale; context.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh); }
        if (transitionAlpha > 0) { context.globalAlpha = transitionAlpha; context.fillStyle = '#000'; context.fillRect(0, 0, w, h); context.globalAlpha = 1; }
        const caption = subtitleAt(timelinePosition);
        if (caption) { context.font = '600 37px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; const rows = wrapText(context, caption, w * .8), lineHeight = 47, blockHeight = rows.length * lineHeight; context.fillStyle = 'rgba(12,13,18,.68)'; context.fillRect(w * .08, h - blockHeight - 76, w * .84, blockHeight + 34); context.fillStyle = '#fff'; rows.forEach((line, index) => context.fillText(line, w / 2, h - 58 - blockHeight / 2 + index * lineHeight, w * .8)); }
      };
      recorder.start(250); status.textContent = `Rendering ${exportClips.length} clip${exportClips.length === 1 ? '' : 's'} in timeline order…`;
      let timelineCursor = 0;
      for (let index = 0; index < exportClips.length; index++) {
        const clip = exportClips[index]; await loadVideo(video, clip);
        video.pause(); await seekVideo(video, clip.start);
        draw(timelineCursor, window.TransformoVideoTransition.fadeAlpha(exportTransitionMode, index, exportClips.length, 0, clip.end - clip.start)); await video.play();
        await new Promise(resolve => {
          const tick = () => { const elapsed = Math.max(0, video.currentTime - clip.start); draw(timelineCursor + elapsed, window.TransformoVideoTransition.fadeAlpha(exportTransitionMode, index, exportClips.length, elapsed, clip.end - clip.start)); if (video.currentTime >= clip.end || video.ended) { video.pause(); resolve(); } else requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        timelineCursor += clip.end - clip.start;
      }
      video.pause(); if (recorder.state !== 'inactive') recorder.stop();
      const blob = await finished; if (graph) stream.getVideoTracks().forEach(track => track.stop()); else stream.getTracks().forEach(track => track.stop()); if (graph) graph.monitor.gain.value = 1;
      if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = URL.createObjectURL(blob);
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const link = workspace.querySelector('#download-video'); link.href = exportUrl; link.download = `${safeBase(exportClips[0].file.name)}-transformo.${extension}`; link.hidden = false;
      const srt = subtitleSrt();
      if (srt) { subtitleUrl = URL.createObjectURL(new Blob([srt], { type: 'text/plain;charset=utf-8' })); subtitleLink.href = subtitleUrl; subtitleLink.download = `${safeBase(exportClips[0].file.name)}-subtitles.srt`; subtitleLink.hidden = false; }
      const duration = exportClips.reduce((sum, clip) => sum + clip.end - clip.start, 0);
      status.textContent = `Export ready · ${extension.toUpperCase()} · ${format(duration)} · ${(blob.size / 1048576).toFixed(1)} MB`; notify('Your edited video timeline is ready to download.');
    } catch (error) {
      if (recorder?.state !== 'inactive') recorder?.stop(); if (graph) stream?.getVideoTracks().forEach(track => track.stop()); else stream?.getTracks().forEach(track => track.stop()); if (graph) graph.monitor.gain.value = 1; status.textContent = error.message || 'Video export failed.'; notify(status.textContent);
    } finally { button.disabled = false; updateTotals(); }
  }
  async function saveProject() {
    const workspace = root(), button = workspace?.querySelector('#save-video-project'), status = workspace?.querySelector('#video-editor-status'), input = workspace?.querySelector('#video-project-name');
    if (!workspace || !clips.length) { notify('Add at least one clip before saving a project.'); return; }
    const references = clips.map(clip => ({ fileId: clip.fileId || window.TransformoWorkspaceFiles?.idFor(clip.file), start: clip.start, end: clip.end }));
    if (clips.some(clip => !clip.duration) || references.some(clip => !clip.fileId)) { notify('Wait for clips to load and save them to this device before saving the project.'); return; }
    projectName = input?.value.trim() || 'Untitled video edit';
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const record = await WorkspaceStore.saveVideoProject({ id: projectId || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: projectName, clips: references, subtitles: subtitles.map(cue => ({ start: cue.start, end: cue.end, text: cue.text })), captionSourceLanguage: workspace.querySelector('#caption-source-language').value, captionTargetLanguage: workspace.querySelector('#caption-language').value, transitionMode });
      projectId = record.id; projectName = record.name; projectDirty = false; restoringProject = false;
      if (input) input.value = projectName;
      if (status) status.textContent = `Saved locally · ${new Date(record.updatedAt).toLocaleTimeString()}`;
      if (button) button.textContent = 'Save changes';
      window.dispatchEvent(new CustomEvent('transformo:video-project-saved'));
    } catch (error) { notify(error.message || 'Could not save this video project locally.'); }
    finally { updateTotals(); }
  }
  async function openProject(id) {
    const project = await WorkspaceStore.getVideoProject(id);
    if (!project) throw new Error('This saved video project is no longer available.');
    if (!Array.isArray(project.clips) || !project.clips.length) throw new Error('This project has no clips to restore.');
    const records = await Promise.all(project.clips.map(clip => WorkspaceStore.get(clip.fileId)));
    const missing = records.findIndex(record => !record?.file);
    if (missing >= 0) throw new Error(`The source clip “${project.clips[missing].fileName || `clip ${missing + 1}`}” is missing from this device. Keep project source clips in your workspace to reopen this edit.`);
    const videoFiles = records.map(record => record.file);
    if (editor(videoFiles, project) === false) return false;
    return true;
  }
  window.addEventListener('beforeunload', event => { if (!projectDirty) return; event.preventDefault(); event.returnValue = ''; });
  window.TransformoVideoEditor = { open: editor, openProject, addClips, importSubtitles: importSrt, currentProjectId: () => projectId, hasWorkspace: () => !!root()?.querySelector('#video-editor') };
})();
