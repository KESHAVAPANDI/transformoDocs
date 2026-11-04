/* Local multi-clip video editor using Canvas + MediaRecorder. */
(() => {
  let clips = [], subtitles = [], activeClip = 0, exportUrl = null, subtitleUrl = null, audioGraph = null;
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
  function close() {
    const workspace = root(); if (workspace) workspace.innerHTML = '';
    clips.forEach(clip => URL.revokeObjectURL(clip.url)); clips = []; subtitles = []; activeClip = 0;
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null;
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); subtitleUrl = null;
    if (audioGraph) { audioGraph.destination.stream.getTracks().forEach(track => track.stop()); audioGraph.context.close(); audioGraph = null; }
    document.removeEventListener('keydown', escape);
    document.querySelector('#videos-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function escape(event) { if (event.key === 'Escape' && clips.length) close(); }
  function totalDuration() { return clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0); }
  function timelineOffset(index) { return clips.slice(0, index).reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0); }
  function timelineTime(index, sourceTime) { const clip = clips[index]; return clip ? timelineOffset(index) + Math.max(0, Math.min(clip.end - clip.start, sourceTime - clip.start)) : 0; }
  function subtitleAt(time) { return subtitles.find(cue => time >= cue.start && time < cue.end)?.text.trim() || ''; }
  function updateSubtitlePreview(time = timelineTime(activeClip, root()?.querySelector('#source-video')?.currentTime || 0)) {
    const preview = root()?.querySelector('#subtitle-preview'); if (!preview) return;
    const value = subtitleAt(time); preview.textContent = value; preview.hidden = !value;
  }
  function renderSubtitles() {
    const list = root()?.querySelector('#subtitle-cues'); if (!list) return;
    list.innerHTML = subtitles.length ? subtitles.map((cue, index) => `<article class="subtitle-cue" data-subtitle-index="${index}"><header><strong>Cue ${String(index + 1).padStart(2, '0')}</strong><button type="button" data-subtitle-remove aria-label="Remove subtitle cue ${index + 1}">×</button></header><div class="subtitle-cue-times"><label>Start <input type="number" min="0" step="0.1" data-subtitle-field="start" value="${cue.start.toFixed(1)}" /></label><label>End <input type="number" min="0" step="0.1" data-subtitle-field="end" value="${cue.end.toFixed(1)}" /></label></div><textarea rows="2" data-subtitle-field="text" aria-label="Subtitle cue ${index + 1} text" placeholder="Type a subtitle…">${escapeHtml(cue.text)}</textarea></article>`).join('') : '<div class="subtitle-empty">Add a cue to place a subtitle on the timeline.</div>';
    updateSubtitlePreview();
  }
  function addSubtitle() {
    const start = timelineTime(activeClip, root()?.querySelector('#source-video')?.currentTime || clips[activeClip]?.start || 0), end = Math.min(totalDuration(), start + 3);
    subtitles.push({ start, end: end > start ? end : start + 3, text: '' });
    renderSubtitles(); root()?.querySelector(`[data-subtitle-index="${subtitles.length - 1}"] textarea`)?.focus();
  }
  function updateSubtitle(event) {
    const field = event.target.closest('[data-subtitle-field]'), cue = field && subtitles[Number(field.closest('[data-subtitle-index]').dataset.subtitleIndex)]; if (!cue) return;
    cue[field.dataset.subtitleField] = field.dataset.subtitleField === 'text' ? field.value : Math.max(0, Number(field.value) || 0);
    updateSubtitlePreview();
  }
  function removeSubtitle(event) {
    const button = event.target.closest('[data-subtitle-remove]'); if (!button) return;
    subtitles.splice(Number(button.closest('[data-subtitle-index]').dataset.subtitleIndex), 1); renderSubtitles();
  }
  function srtTimestamp(seconds) {
    const value = Math.max(0, Math.round(seconds * 1000)), hours = Math.floor(value / 3600000), minutes = Math.floor(value % 3600000 / 60000), secs = Math.floor(value % 60000 / 1000), millis = value % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }
  async function addClips(files) {
    const candidates = [...files].filter(file => file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file.name));
    const added = [];
    for (const file of candidates) {
      const clip = { file, url: URL.createObjectURL(file), duration: 0, start: 0, end: 0 };
      clips.push(clip);
      try {
        const duration = await readDuration(clip.url);
        clip.duration = duration; clip.end = duration; added.push(clip);
      } catch { clips.pop(); URL.revokeObjectURL(clip.url); notify(`Could not read ${file.name}. Try an MP4 or WebM file.`); }
    }
    if (clips.length) {
      activeClip = Math.min(activeClip, clips.length - 1);
      renderTimeline(); await showClip(activeClip); updateTotals();
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
  function editor(files) {
    close();
    const workspace = root(); if (!workspace) return;
    workspace.innerHTML = `<section class="video-editor glass-panel" id="video-editor" aria-labelledby="video-editor-title">
      <header class="video-editor-header"><div><div class="eyebrow"><span class="live-dot video-dot"></span> LOCAL VIDEO EDITOR</div><h2 id="video-editor-title">Your video timeline</h2><p>Arrange clips, set in and out points, then export one sequence.</p></div><button class="video-back-button" id="video-editor-close" type="button">← Back to projects</button></header>
      <div class="video-editor-grid"><div class="video-stage"><video id="source-video" controls playsinline></video><canvas id="render-canvas" width="1280" height="720" hidden></canvas><div id="subtitle-preview" class="subtitle-preview" hidden></div></div>
      <aside class="video-inspector"><div class="inspector-label">CLIP TRIM</div><div class="active-clip-name" id="active-clip-name">Select a timeline clip</div><div class="trim-fields"><label>In <input id="trim-start" type="number" min="0" step="0.1" value="0" /></label><label>Out <input id="trim-end" type="number" min="0" step="0.1" value="0" /></label></div>
      <div class="inspector-label caption-label">SUBTITLE TRACK</div><div class="subtitle-track-tools"><button class="secondary-button" id="add-subtitle" type="button">＋ Add cue</button><button class="secondary-button" id="translate-caption" type="button">Translate track</button></div><input id="caption-language" type="hidden" value="es" /><div class="caption-language-options" role="group" aria-label="Subtitle translation language"><button type="button" data-caption-language="es" aria-pressed="true">Español</button><button type="button" data-caption-language="fr" aria-pressed="false">Français</button><button type="button" data-caption-language="ja" aria-pressed="false">日本語</button><button type="button" data-caption-language="hi" aria-pressed="false">हिन्दी</button><button type="button" data-caption-language="ta" aria-pressed="false">தமிழ்</button><button type="button" data-caption-language="de" aria-pressed="false">Deutsch</button><button type="button" data-caption-language="zh" aria-pressed="false">中文</button><button type="button" data-caption-language="ko" aria-pressed="false">한국어</button><button type="button" data-caption-language="ar" aria-pressed="false">العربية</button></div><div id="subtitle-cues" class="subtitle-cues"></div>
      <div class="inspector-note">Cues use seconds on the combined timeline. Export burns them into the video and can also download an SRT track.</div><button class="primary-button" id="export-video" type="button">Export timeline <span>↗</span></button><a id="download-video" class="video-download" hidden>Download edited video ↓</a><a id="download-subtitles" class="video-download subtitle-download" hidden>Download subtitles (.srt) ↓</a><div id="video-editor-status" class="video-editor-status">Add clips to start your edit.</div></aside></div>
      <section class="timeline-panel" aria-label="Video timeline"><div class="timeline-heading"><div><strong>Timeline</strong><span id="timeline-summary">0 clips · 00:00</span></div><button class="secondary-button" id="video-add-clips" type="button">＋ Add clips</button><input id="timeline-input" type="file" accept="video/*" multiple hidden /></div><div class="timeline-ruler"><span>00:00</span><div><i></i><i></i><i></i><i></i><i></i></div><span id="timeline-duration">00:00</span></div><div class="timeline-clips" id="timeline-clips"></div></section>
      <div class="video-timeline"><span>◷</span><div class="timeline-rail"><div class="timeline-fill"></div></div><span id="video-current-time">00:00</span><span class="timeline-divider">/</span><span id="video-duration">00:00</span></div>
    </section>`;
    const video = workspace.querySelector('#source-video');
    video.addEventListener('loadedmetadata', () => { if (!clips[activeClip]) return; video.currentTime = clips[activeClip].start; });
    video.addEventListener('timeupdate', () => {
      workspace.querySelector('#video-current-time').textContent = format(video.currentTime);
      const clip = clips[activeClip], span = clip ? Math.max(.1, clip.end - clip.start) : 0;
      workspace.querySelector('.timeline-fill').style.width = `${clip ? Math.min(100, Math.max(0, (video.currentTime - clip.start) / span * 100)) : 0}%`;
      updateSubtitlePreview();
    });
    workspace.querySelector('#video-editor-close').addEventListener('click', close);
    workspace.querySelector('#video-add-clips').addEventListener('click', () => workspace.querySelector('#timeline-input').click());
    workspace.querySelector('#timeline-input').addEventListener('change', async event => { try { const added = await addClips(event.target.files); if (added.length) window.dispatchEvent(new CustomEvent('transformo:video-files-added', { detail: { files: added } })); } catch (error) { notify(error.message || 'Could not add those clips.'); } event.target.value = ''; });
    workspace.querySelector('#timeline-clips').addEventListener('click', timelineAction);
    workspace.querySelector('#trim-start').addEventListener('change', updateTrim);
    workspace.querySelector('#trim-end').addEventListener('change', updateTrim);
    workspace.querySelector('#add-subtitle').addEventListener('click', addSubtitle);
    workspace.querySelector('#subtitle-cues').addEventListener('input', updateSubtitle);
    workspace.querySelector('#subtitle-cues').addEventListener('click', removeSubtitle);
    workspace.querySelector('#translate-caption').addEventListener('click', translateCaption);
    workspace.querySelectorAll('[data-caption-language]').forEach(button => button.addEventListener('click', () => {
      workspace.querySelector('#caption-language').value = button.dataset.captionLanguage;
      workspace.querySelectorAll('[data-caption-language]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    }));
    workspace.querySelector('#export-video').addEventListener('click', exportVideo);
    renderSubtitles();
    document.addEventListener('keydown', escape);
    addClips(files).catch(error => notify(error.message || 'Could not load the selected clips.'));
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (action === 'remove') { const selectedClip = clips[activeClip], [removed] = clips.splice(index, 1); URL.revokeObjectURL(removed.url); activeClip = clips.indexOf(selectedClip); if (activeClip < 0) activeClip = Math.max(0, Math.min(index, clips.length - 1)); renderTimeline(); if (clips.length) showClip(activeClip).catch(error => notify(error.message)); else { const video = root()?.querySelector('#source-video'), label = root()?.querySelector('#active-clip-name'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } if (label) label.textContent = 'Select a timeline clip'; } return; }
    const next = action === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= clips.length) return;
    [clips[index], clips[next]] = [clips[next], clips[index]];
    if (activeClip === index) activeClip = next; else if (activeClip === next) activeClip = index;
    renderTimeline(); showClip(activeClip).catch(error => notify(error.message));
  }
  function updateTrim() {
    const clip = clips[activeClip], workspace = root(); if (!clip || !workspace) return;
    const start = Math.max(0, Math.min(clip.duration, Number(workspace.querySelector('#trim-start').value) || 0));
    const end = Math.max(0, Math.min(clip.duration, Number(workspace.querySelector('#trim-end').value) || clip.duration));
    clip.start = start; clip.end = end;
    workspace.querySelector('#trim-start').value = start.toFixed(1); workspace.querySelector('#trim-end').value = end.toFixed(1);
    if (end > start) workspace.querySelector('#source-video').currentTime = start;
    renderTimeline();
  }
  function updateTotals() {
    const workspace = root(); if (!workspace) return;
    const count = clips.length, duration = totalDuration();
    const summary = workspace.querySelector('#timeline-summary'); if (summary) summary.textContent = `${count} clip${count === 1 ? '' : 's'} · ${format(duration)}`;
    const total = workspace.querySelector('#timeline-duration'); if (total) total.textContent = format(duration);
    const button = workspace.querySelector('#export-video'); if (button) button.disabled = !count || clips.some(clip => clip.end <= clip.start);
  }
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/), rows = []; let row = '';
    for (const word of words) { const next = row ? `${row} ${word}` : word; if (row && ctx.measureText(next).width > maxWidth) { rows.push(row); row = word; } else row = next; }
    if (row) rows.push(row); return rows;
  }
  async function translateCaption() {
    const workspace = root(), button = workspace?.querySelector('#translate-caption'), cues = subtitles.filter(cue => cue.text.trim());
    if (!cues.length) { notify('Add subtitle text before translating the track.'); return; }
    if (!window.Translator) { notify('This browser does not provide on-device translation.'); return; }
    button.disabled = true; button.textContent = 'Checking language…';
    try {
      const targetLanguage = workspace.querySelector('#caption-language').value, availability = await Translator.availability({ sourceLanguage: 'en', targetLanguage });
      if (availability === 'unavailable') throw new Error(`The browser has no English → ${targetLanguage} translation model.`);
      const translator = await Translator.create({ sourceLanguage: 'en', targetLanguage });
      try { for (let index = 0; index < cues.length; index++) { button.textContent = `Translating ${index + 1}/${cues.length}…`; cues[index].text = await translator.translate(cues[index].text); } }
      finally { translator.destroy?.(); }
      renderSubtitles(); notify('Translated subtitle track is ready to review.');
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
    const exportClips = clips.map(clip => ({ ...clip }));
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
      const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = preferred.find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const finished = new Promise((resolve, reject) => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })); recorder.onerror = () => reject(new Error('The browser could not finish the video render.')); });
      const draw = (timelinePosition = 0) => {
        const w = canvas.width, h = canvas.height; context.fillStyle = '#111'; context.fillRect(0, 0, w, h);
        if (video.readyState >= 2 && video.videoWidth) { const scale = Math.min(w / video.videoWidth, h / video.videoHeight), dw = video.videoWidth * scale, dh = video.videoHeight * scale; context.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh); }
        const caption = subtitleAt(timelinePosition);
        if (caption) { context.font = '600 37px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; const rows = wrapText(context, caption, w * .8), lineHeight = 47, blockHeight = rows.length * lineHeight; context.fillStyle = 'rgba(12,13,18,.68)'; context.fillRect(w * .08, h - blockHeight - 76, w * .84, blockHeight + 34); context.fillStyle = '#fff'; rows.forEach((line, index) => context.fillText(line, w / 2, h - 58 - blockHeight / 2 + index * lineHeight, w * .8)); }
      };
      recorder.start(250); status.textContent = `Rendering ${exportClips.length} clip${exportClips.length === 1 ? '' : 's'} in timeline order…`;
      let timelineCursor = 0;
      for (let index = 0; index < exportClips.length; index++) {
        const clip = exportClips[index]; await loadVideo(video, clip);
        video.pause(); await seekVideo(video, clip.start);
        draw(timelineCursor); await video.play();
        await new Promise(resolve => {
          const tick = () => { draw(timelineCursor + Math.max(0, video.currentTime - clip.start)); if (video.currentTime >= clip.end || video.ended) { video.pause(); resolve(); } else requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        timelineCursor += clip.end - clip.start;
      }
      video.pause(); if (recorder.state !== 'inactive') recorder.stop();
      const blob = await finished; if (graph) stream.getVideoTracks().forEach(track => track.stop()); else stream.getTracks().forEach(track => track.stop()); if (graph) graph.monitor.gain.value = 1;
      if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = URL.createObjectURL(blob);
      const link = workspace.querySelector('#download-video'); link.href = exportUrl; link.download = `${safeBase(exportClips[0].file.name)}-transformo.webm`; link.hidden = false;
      const srt = subtitles.filter(cue => cue.text.trim() && cue.start < totalDuration() && Math.min(cue.end, totalDuration()) > cue.start).sort((a, b) => a.start - b.start).map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(Math.min(cue.end, totalDuration()))}\n${cue.text.trim()}`).join('\n\n');
      if (srt) { subtitleUrl = URL.createObjectURL(new Blob([srt], { type: 'text/plain;charset=utf-8' })); subtitleLink.href = subtitleUrl; subtitleLink.download = `${safeBase(exportClips[0].file.name)}-subtitles.srt`; subtitleLink.hidden = false; }
      const duration = exportClips.reduce((sum, clip) => sum + clip.end - clip.start, 0);
      status.textContent = `Export ready · ${format(duration)} · ${(blob.size / 1048576).toFixed(1)} MB`; notify('Your edited video timeline is ready to download.');
    } catch (error) {
      if (recorder?.state !== 'inactive') recorder?.stop(); if (graph) stream?.getVideoTracks().forEach(track => track.stop()); else stream?.getTracks().forEach(track => track.stop()); if (graph) graph.monitor.gain.value = 1; status.textContent = error.message || 'Video export failed.'; notify(status.textContent);
    } finally { button.disabled = false; updateTotals(); }
  }
  window.TransformoVideoEditor = { open: editor };
})();
