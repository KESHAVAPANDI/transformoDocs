/* Single-clip, local video trim and caption export using Canvas + MediaRecorder. */
(() => {
  const input = document.querySelector('#video-input');
  let currentUrl = null, currentFile = null;
  function notify(message) {
    const toast = document.querySelector('#toast'); if (!toast) return;
    toast.textContent = message; toast.classList.add('show');
    clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function close() { document.querySelector('#video-editor-overlay')?.remove(); document.body.style.overflow = ''; }
  function editor(file) {
    close(); currentFile = file; currentUrl && URL.revokeObjectURL(currentUrl); currentUrl = URL.createObjectURL(file);
    const overlay = document.createElement('div'); overlay.id = 'video-editor-overlay'; overlay.className = 'video-edit-backdrop';
    overlay.innerHTML = `<section class="video-editor glass-panel" role="dialog" aria-modal="true" aria-labelledby="video-editor-title"><header class="video-editor-header"><div><div class="eyebrow"><span class="live-dot video-dot"></span> LOCAL VIDEO EDITOR</div><h2 id="video-editor-title">${file.name.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</h2></div><button class="modal-close" id="video-editor-close" aria-label="Close">×</button></header><div class="video-editor-grid"><div class="video-stage"><video id="source-video" controls playsinline></video><canvas id="render-canvas" width="1280" height="720" hidden></canvas><div class="video-stage-caption">Your video stays on this device.</div></div><aside class="video-inspector"><div class="inspector-label">01 / SHAPE THE CUT</div><div class="trim-fields"><label>Start <input id="trim-start" type="number" min="0" step="0.1" value="0" /></label><label>End <input id="trim-end" type="number" min="0" step="0.1" value="0" /></label></div><div class="inspector-label caption-label">02 / ADD A CAPTION</div><textarea id="video-caption" rows="4" placeholder="Type a caption to burn into the video…"></textarea><div class="caption-translate"><select id="caption-language"><option value="es">Spanish</option><option value="fr">French</option><option value="ja">Japanese</option><option value="hi">Hindi</option><option value="ta">Tamil</option></select><button class="secondary-button" id="translate-caption">Translate caption</button></div><div class="inspector-note">Captions sit in the lower safe area. Export creates a new WebM file.</div><button class="primary-button" id="export-video">Export trimmed video <span>↗</span></button><a id="download-video" class="video-download" hidden>Download edited video ↓</a><div id="video-editor-status" class="video-editor-status">Ready when you are.</div></aside></div><div class="video-timeline"><span>◷</span><div class="timeline-rail"><div class="timeline-fill"></div></div><span id="video-current-time">00:00</span><span class="timeline-divider">/</span><span id="video-duration">00:00</span></div></section>`;
    document.body.append(overlay); document.body.style.overflow = 'hidden';
    const video = overlay.querySelector('#source-video'); video.src = currentUrl;
    video.addEventListener('loadedmetadata', () => { overlay.querySelector('#trim-end').value = video.duration.toFixed(1); overlay.querySelector('#trim-end').max = video.duration; overlay.querySelector('#video-duration').textContent = format(video.duration); });
    video.addEventListener('timeupdate', () => { overlay.querySelector('#video-current-time').textContent = format(video.currentTime); const end = Number(overlay.querySelector('#trim-end').value) || video.duration; overlay.querySelector('.timeline-fill').style.width = `${Math.min(100,video.currentTime/Math.max(1,end)*100)}%`; });
    overlay.querySelector('#video-editor-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#export-video').addEventListener('click', exportVideo);
    overlay.querySelector('#video-caption').addEventListener('input', event => { overlay.querySelector('.video-stage-caption').textContent = event.target.value || 'Your video stays on this device.'; });
    overlay.querySelector('#translate-caption').addEventListener('click', translateCaption);
    document.addEventListener('keydown', escape, { once: true });
  }
  function escape(event) { if (event.key === 'Escape') close(); }
  function format(seconds) { if (!Number.isFinite(seconds)) return '00:00'; const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/), rows=[]; let row='';
    for (const word of words) { const next=row?`${row} ${word}`:word; if(row&&ctx.measureText(next).width>maxWidth){rows.push(row);row=word}else row=next; }
    if(row)rows.push(row); return rows;
  }
  async function translateCaption() {
    const overlay=document.querySelector('#video-editor-overlay'),field=overlay?.querySelector('#video-caption'),button=overlay?.querySelector('#translate-caption');
    if(!field?.value.trim()){notify('Add a caption to translate first.');return}
    if(!window.Translator){notify('This browser does not provide on-device translation.');return}
    button.disabled=true;button.textContent='Translating…';
    try{const targetLanguage=overlay.querySelector('#caption-language').value,translator=await Translator.create({sourceLanguage:'en',targetLanguage});field.value=await translator.translate(field.value);translator.destroy?.();field.dispatchEvent(new Event('input',{bubbles:true}));notify('Translated caption is ready to review.')}catch(error){notify(error.message||'Translation could not start.')}finally{button.disabled=false;button.textContent='Translate caption'}
  }
  async function exportVideo() {
    const overlay=document.querySelector('#video-editor-overlay'),video=overlay?.querySelector('#source-video'),canvas=overlay?.querySelector('#render-canvas'); if(!video||!canvas)return;
    const start=Math.max(0,Number(overlay.querySelector('#trim-start').value)||0),end=Math.min(video.duration,Number(overlay.querySelector('#trim-end').value)||video.duration);
    if(!Number.isFinite(video.duration)||end<=start){notify('Choose a valid start and end time.');return}
    if(!window.MediaRecorder||!canvas.captureStream){notify('Video export is not supported in this browser. Try a recent Chrome or Edge.');return}
    const button=overlay.querySelector('#export-video'),status=overlay.querySelector('#video-editor-status'),caption=overlay.querySelector('#video-caption').value.trim(); button.disabled=true; status.textContent='Preparing a local video render…';
    try{
      const context=canvas.getContext('2d'),stream=canvas.captureStream(30),capture=video.captureStream?.()||video.mozCaptureStream?.();
      capture?.getAudioTracks().forEach(track=>stream.addTrack(track));
      const preferred=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];const mime=preferred.find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      const finished=new Promise((resolve,reject)=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||'video/webm'}));recorder.onerror=()=>reject(new Error('The browser could not finish the video render.'))});
      const draw=()=>{
        const w=canvas.width,h=canvas.height,scale=Math.max(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*scale,dh=video.videoHeight*scale;
        context.fillStyle='#111';context.fillRect(0,0,w,h);if(video.readyState>=2)context.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);
        if(caption){context.font='600 37px Arial, sans-serif';context.textAlign='center';context.textBaseline='middle';const rows=wrapText(context,caption,w*.8),lineHeight=47,blockHeight=rows.length*lineHeight;context.fillStyle='rgba(12,13,18,.68)';context.fillRect(w*.08,h-blockHeight-76,w*.84,blockHeight+34);context.fillStyle='#fff';rows.forEach((line,i)=>context.fillText(line,w/2,h-58-blockHeight/2+i*lineHeight,w*.8));}
      };
      await new Promise((resolve,reject)=>{video.pause();video.currentTime=start;video.addEventListener('seeked',resolve,{once:true});video.addEventListener('error',reject,{once:true})});draw();recorder.start(250);await video.play();status.textContent='Rendering in this tab…';
      const tick=()=>{draw();if(video.currentTime>=end||video.ended){video.pause();if(recorder.state!=='inactive')recorder.stop();return}requestAnimationFrame(tick)};requestAnimationFrame(tick);
      const blob=await finished;stream.getTracks().forEach(track=>track.stop());const link=overlay.querySelector('#download-video');link.href=URL.createObjectURL(blob);link.download=`${currentFile.name.replace(/\.[^.]+$/,'')}-transformo.webm`;link.hidden=false;status.textContent=`Export ready · ${(blob.size/1048576).toFixed(1)} MB`;notify('Your edited video is ready to download.');
    }catch(error){status.textContent=error.message||'Video export failed.';notify(status.textContent)}finally{button.disabled=false}
  }
  document.querySelector('#video-projects')?.addEventListener('click',()=>input?.click());
  window.TransformoVideoEditor={open:editor};
})();
