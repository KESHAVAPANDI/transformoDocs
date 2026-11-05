const iconTypes={pdf:'pdf',docx:'docx',doc:'docx',xlsx:'xlsx',xls:'xlsx',pptx:'pptx',ppt:'pptx',mp4:'mp4',mov:'mp4',webm:'mp4'};
let files=[];
const workspaceFileIds=new WeakMap();
let activeFilter='all', pendingTask='Translate', toastTimer, taskPages=[], selectedTaskFiles=[], previewUrls=[], translationPreviews={source:null,translated:null}, translatedDocument=null, translationResultDocument=null, translationHistory=null, translationLineBaseline=null, previousView='documents', organizeOrder=[], organizePreviewPages=[], selectedSplitPages=new Set(), splitPreviewPages=[], workspaceSelectionIds=new Set(), selectedConversion='', selectedCompression='balanced', docxPreviewToken=0, docxPreviewReady=false, docxTranslationHost=null, docxTranslationReady=false, docxTranslationToken=0, docxEditHost=null, docxEditReady=false, docxEditToken=0, translationAvailabilityToken=0;
const translationLanguages=[['en','English'],['ja','日本語'],['es','Español'],['fr','Français'],['hi','हिन्दी'],['ta','தமிழ்'],['de','Deutsch'],['zh','中文'],['pt','Português'],['ko','한국어'],['ar','العربية'],['it','Italiano'],['ru','Русский'],['nl','Nederlands'],['bn','বাংলা'],['bg','Български'],['cs','Čeština'],['da','Dansk'],['el','Ελληνικά'],['fi','Suomi'],['he','עברית'],['hr','Hrvatski'],['hu','Magyar'],['id','Bahasa Indonesia'],['kn','ಕನ್ನಡ'],['lt','Lietuvių'],['mr','मराठी'],['no','Norsk'],['pl','Polski'],['ro','Română'],['sk','Slovenčina'],['sl','Slovenščina'],['sv','Svenska'],['te','తెలుగు'],['th','ไทย'],['tr','Türkçe'],['uk','Українська'],['vi','Tiếng Việt'],['zh-Hant','繁體中文']];
const ocrLanguages=[['eng','English'],['jpn','日本語'],['spa','Español'],['fra','Français'],['hin','हिन्दी'],['tam','தமிழ்'],['deu','Deutsch'],['chi_sim','简体中文'],['por','Português'],['kor','한국어'],['ara','العربية'],['ita','Italiano'],['rus','Русский'],['nld','Nederlands'],['ben','বাংলা'],['bul','Български'],['ces','Čeština'],['dan','Dansk'],['ell','Ελληνικά'],['fin','Suomi'],['heb','עברית'],['hrv','Hrvatski'],['hun','Magyar'],['ind','Bahasa Indonesia'],['kan','ಕನ್ನಡ'],['mar','मराठी'],['nor','Norsk'],['pol','Polski'],['ron','Română'],['slk','Slovenčina'],['slv','Slovenščina'],['swe','Svenska'],['tel','తెలుగు'],['tha','ไทย'],['tur','Türkçe'],['ukr','Українська'],['vie','Tiếng Việt'],['chi_tra','繁體中文']];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function languagePicker(fieldId,label,selected){return `<div class="language-option-grid" role="group" aria-label="${label}">${translationLanguages.map(([code,name])=>`<button type="button" class="language-option ${code===selected?'selected':''}" data-language-target="${fieldId}" data-language-value="${code}" aria-pressed="${code===selected}">${name}</button>`).join('')}<button type="button" class="language-more" data-language-more aria-expanded="false">More languages</button></div>`}
function ocrLanguagePicker(){return `<div class="language-option-grid ocr-language-options" role="group" aria-label="OCR language">${ocrLanguages.map(([code,name],index)=>`<button type="button" class="language-option ${index===0?'selected':''}" data-language-target="ocr-language" data-language-value="${code}" aria-pressed="${index===0}">${name}</button>`).join('')}<button type="button" class="language-more" data-language-more aria-expanded="false">More languages</button></div>`}
async function refreshTranslationAvailability(){
  const status=$('#translation-status');if(!status)return;
  const token=++translationAvailabilityToken,source=$('#source-language')?.value,target=$('#target-language')?.value,mode=$('#translation-mode')?.value||'smart',allowOnline=!!$('#translation-consent')?.checked;
  const message=status.lastElementChild;status.dataset.state='checking';message.textContent='Checking on-device translation…';
  if(source===target){status.dataset.state='unsupported';message.textContent='Choose two different languages to translate.';return}
  const onlineStatus=async()=>{
    if(!allowOnline){status.dataset.state='unsupported';message.textContent='Online translation needs your consent. Check the box to send selected text to DeepL.';return}
    try{const response=await fetch('http://127.0.0.1:8766/health');if(!response.ok)throw new Error();const result=await response.json();if(!result.ready)throw new Error();if(token!==translationAvailabilityToken||!status.isConnected)return;status.dataset.state='ready';message.textContent='DeepL bridge ready. Your plan sets the quota; text is sent only when you start translation.'}
    catch{if(token!==translationAvailabilityToken||!status.isConnected)return;status.dataset.state='unsupported';message.textContent='Start the optional local DeepL bridge from README.md. No document text has been sent.'}
  };
  if(mode==='online'){await onlineStatus();return}
  if(typeof window.Translator?.availability!=='function'){
    if(mode==='smart'&&allowOnline){await onlineStatus();return}
    status.dataset.state='unsupported';message.textContent='This browser has no on-device translator. Enable the DeepL fallback and consent to send text online.';return;
  }
  try{
    const availability=await window.Translator.availability({sourceLanguage:source,targetLanguage:target});
    if(token!==translationAvailabilityToken||!status.isConnected)return;
    const fallback=mode==='smart'&&allowOnline?' DeepL can take over if the local model is unavailable.':' Text stays in this browser.';
    const states={available:['ready',`On-device translation is ready.${fallback}`],downloadable:['download',`The language model downloads on first use.${fallback}`],downloading:['download',`The language model is downloading.${fallback}`],unavailable:['unsupported',`No on-device model is available for ${source} → ${target}.`]};
    const [state,text]=states[availability]||['unsupported','This language pair is not available for on-device translation.'];
    if(availability==='unavailable'&&mode==='smart'&&allowOnline){await onlineStatus();return}
    status.dataset.state=state;message.textContent=text;
  }catch{
    if(token!==translationAvailabilityToken||!status.isConnected)return;
    if(mode==='smart'&&allowOnline){await onlineStatus();return}
    status.dataset.state='error';message.textContent='Could not check local translation availability. Try again or choose the online option.';
  }
}
function getTranslationOptions(){return{mode:$('#translation-mode')?.value||'smart',allowOnline:!!$('#translation-consent')?.checked}}
function conversionType(files=selectedTaskFiles){if(!files.length)return'';const types=files.map(file=>{const ext=(file.name.split('.').pop()||'').toLowerCase();return ext==='pdf'?'pdf':ext==='txt'?'text':ext==='docx'?'docx':ext==='pptx'?'pptx':ext==='xlsx'?'xlsx':file.type.startsWith('image/')||/^(png|jpe?g|webp|gif|bmp)$/.test(ext)?'image':'other'});return types.every(type=>type===types[0])?types[0]:'mixed'}
function updateConversionChoices(){
  const root=$('#conversion-options'),help=$('#conversion-help');if(!root)return;
  const type=conversionType(),choices=type==='pdf'?[['pdf-images','PDF → PNG images','Export every page into a ZIP.'],['pdf-jpg','PDF → JPG images','Export smaller, shareable page images.'],['pdf-docx','PDF → Word','Create editable text with page breaks.'],['pdf-text','PDF → text','Extract readable text into a .txt file.']]:type==='docx'?[['docx-pdf','DOCX → PDF','Preview pages and export a visual PDF.'],['docx-png','DOCX → PNG','Export page images as a ZIP.'],['docx-jpg','DOCX → JPG','Export smaller page images as a ZIP.'],['docx-text','DOCX → text','Keep paragraphs, list markers, and table columns.']]:type==='pptx'?[['pptx-text','PPTX → text','Extract slide text in presentation order.']]:type==='xlsx'?[['xlsx-csv','XLSX → CSV','Export worksheet values as spreadsheet text.']]:type==='image'?[['images-pdf','Images → PDF','Combine selected images into one PDF.']]:type==='text'?[['text-pdf','Text → PDF','Create a paginated PDF from text files.']]:[];
  if(type&&!choices.some(([id])=>id===selectedConversion))selectedConversion='';
  root.innerHTML=choices.length?choices.map(([id,title,detail])=>`<button type="button" class="conversion-option-card ${selectedConversion===id?'selected':''}" data-conversion-option="${id}" aria-pressed="${selectedConversion===id}"><span class="conversion-option-icon">${id.startsWith('docx-')||id==='pdf-docx'?'W':id==='pdf-text'||id==='docx-text'||id==='pptx-text'?'T':id==='pdf-images'?'▧':id==='pdf-jpg'?'◉':id==='images-pdf'?'▤':'¶'}</span><span><strong>${title}</strong><small>${detail}</small></span><span class="conversion-option-check">✓</span></button>`).join(''):'<div class="conversion-empty">Choose files of one type to see available conversions.</div>';
  if(!help)return;
  if(type==='pdf'&&selectedConversion==='pdf-docx')help.textContent='Text and page breaks are preserved; complex layout, fonts, and tables need review. Scanned pages need OCR and an OCR-enabled PDF export first.';
  else if(type==='mixed')help.textContent='Choose one file type in a batch.';
  else if(type==='other')help.textContent='This file type does not have a conversion available yet.';
  else if(type==='docx')help.textContent=selectedTaskFiles.length!==1&&['docx-pdf','docx-png','docx-jpg'].includes(selectedConversion)?'Choose one Word file for a rendered page export.':selectedConversion==='docx-pdf'?'The browser-rendered pages become a visual PDF.':selectedConversion==='docx-png'?'Export every browser-rendered page as a PNG in a ZIP.':selectedConversion==='docx-jpg'?'Export every browser-rendered page as a JPG in a ZIP.':selectedConversion==='docx-text'?'Extract paragraphs, lists, and tables as text.':'Choose a Word output.';
  else if(type==='pptx')help.textContent='Text only: slide layout, images, and styling are not included.';
  else if(type==='xlsx')help.textContent='Values only: cell styling, formulas, and workbook formatting are not included.';
  else help.textContent='Choose an output card to continue.';
}
function updateTaskCta(){
  const button=$('#tool-cta');if(!button)return;
  if(pendingTask==='Split'){const range=$('#page-range')?.value.trim(),count=selectedSplitPages.size;button.innerHTML=range?'Extract page range <span>↗</span>':count?`Extract ${count} page${count===1?'':'s'} <span>↗</span>`:'Extract pages <span>↗</span>';button.disabled=!selectedTaskFiles.length||(!range&&!count);return}
  if(pendingTask==='Convert'){updateConversionChoices();const labels={'pdf-images':'Export PNG pages','pdf-jpg':'Export JPG pages','pdf-text':'Extract PDF text','pdf-docx':'Convert PDF to Word','docx-pdf':'Create visual PDF','docx-png':'Export Word pages as PNG','docx-jpg':'Export Word pages as JPG','docx-text':'Download Word text','pptx-text':'Download slide text','xlsx-csv':'Export CSV files','images-pdf':'Create PDF from images','text-pdf':'Create PDF from text'},needsDocxPreview=['docx-pdf','docx-png','docx-jpg'].includes(selectedConversion);button.innerHTML=`${labels[selectedConversion]||'Choose a conversion'} <span>↗</span>`;button.disabled=!selectedTaskFiles.length||conversionType()==='mixed'||conversionType()==='other'||!selectedConversion||(needsDocxPreview&&(selectedTaskFiles.length!==1||!docxPreviewReady));return}
  if(pendingTask==='Compress'){button.innerHTML='Compress PDF <span>↗</span>';button.disabled=!selectedTaskFiles.length||!selectedCompression;return}
  if(pendingTask==='Edit'){const isDocx=selectedTaskFiles[0]?.name.toLowerCase().endsWith('.docx');button.innerHTML='Export edited PDF <span>↗</span>';button.disabled=!selectedTaskFiles.length||(isDocx&&!docxEditReady);return}
  if(pendingTask==='Translate'){const source=$('#source-language')?.value,target=$('#target-language')?.value,same=source&&source===target,isDocx=selectedTaskFiles[0]?.name.toLowerCase().endsWith('.docx'),needsConsent=$('#translation-mode')?.value==='online'&&!$('#translation-consent')?.checked;button.innerHTML=same?'Choose different languages <span>↗</span>':translatedDocument?'Download translated PDF <span>↗</span>':'Translate document <span>↗</span>';button.disabled=same||needsConsent||(!selectedTaskFiles.length&&!translatedDocument)||(isDocx&&!docxTranslationReady);return}
  if(pendingTask==='Merge'){button.innerHTML=selectedTaskFiles.length>=2?`Merge ${selectedTaskFiles.length} PDFs <span>↗</span>`:'Choose at least 2 PDFs <span>↗</span>';button.disabled=selectedTaskFiles.length<2;return}
  if(pendingTask==='Watermark'){button.disabled=!selectedTaskFiles.length||!$('#watermark-text')?.value.trim();return}
  button.disabled=!selectedTaskFiles.length;
}
function renderFiles(){const list=$('#file-list'),shown=files.filter(f=>activeFilter==='all'||f.kind===activeFilter);$('#empty-state').hidden=shown.length>0;list.innerHTML=shown.map((f,i)=>`<div class="file-row" style="animation-delay:${i*45}ms"><div class="file-name"><span class="file-type-icon ${f.tone}">${esc(f.ext)}</span><span class="file-title-wrap">${f.id?`<button class="file-title file-open" data-open-file-id="${esc(f.id)}">${esc(f.name)}</button>`:`<div class="file-title">${esc(f.name)}</div>`}<div class="file-meta">${f.kind==='video'?'Video':'Saved on this device'}</div></span></div><span class="file-date">${esc(f.date)}</span><span class="file-size">${esc(f.size)}</span><button class="row-menu" aria-label="File actions" data-file-id="${esc(f.id||'')}" data-file="${esc(f.name)}">···</button></div>`).join('');renderVideoProjects();}
function renderVideoProjects(){const root=$('#video-projects');if(!root)return;const clips=files.filter(file=>file.kind==='video');root.innerHTML=clips.length?clips.map((file,index)=>`<article class="video-project-card"><div class="project-thumb ${index%3===1?'thumb-two':index%3===2?'thumb-three':''}"><button class="project-play" type="button" data-open-video-index="${index}" aria-label="Open ${esc(file.name)}">▶</button></div><div class="project-meta"><span class="project-name">${esc(file.name)}</span><span class="project-duration">${esc(file.size)}</span></div><div class="project-updated">Saved on this device</div></article>`).join(''):'<div class="video-empty-state"><span>▷</span><strong>Your video space is ready.</strong><small>Add a clip to start an edit. It will stay on this device.</small></div>';}
async function renderSavedVideoProjects(){const root=$('#saved-video-projects');if(!root)return;try{const projects=await WorkspaceStore.listVideoProjects();root.innerHTML=projects.length?projects.map((project,index)=>{const clips=Array.isArray(project.clips)?project.clips:[],subtitles=Array.isArray(project.subtitles)?project.subtitles:[],seconds=Math.round(clips.reduce((sum,clip)=>sum+Math.max(0,clip.end-clip.start),0)),time=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,saved=project.updatedAt?new Date(project.updatedAt).toLocaleDateString():'Saved locally';return`<article class="video-project-card saved-video-project-card"><div class="project-thumb ${index%3===1?'thumb-two':index%3===2?'thumb-three':''}"><button class="project-play" type="button" data-open-video-project-id="${esc(project.id)}" aria-label="Open video project ${esc(project.name)}">▶</button><span class="saved-project-badge">${clips.length} CLIP${clips.length===1?'':'S'}</span><button type="button" class="saved-project-remove" data-remove-video-project-id="${esc(project.id)}" aria-label="Delete video project ${esc(project.name)}">×</button></div><div class="project-meta"><span class="project-name" title="${esc(project.name)}">${esc(project.name)}</span><span class="project-duration">${time}</span></div><div class="project-updated">${saved} · ${subtitles.length} subtitle cue${subtitles.length===1?'':'s'}</div></article>`}).join(''):'<div class="video-project-empty"><span>✧</span><strong>No saved edits yet</strong><small>Build a timeline, then save it to reopen your clip order, trims, and captions here.</small></div>'}catch{root.innerHTML='<div class="video-project-empty"><strong>Saved projects are unavailable</strong><small>Local browser storage could not be opened.</small></div>'}}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function setView(view){$$('.page-view').forEach(v=>v.classList.toggle('visible',v.id===`${view}-view`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===(view==='tool'?'documents':view)));$('#crumb-current').textContent=view==='videos'?'Video studio':view==='tool'?$('#tool-title').textContent:'Documents';window.scrollTo({top:0,behavior:'smooth'});}
function openTask(task,conversionPreset=''){
  docxPreviewToken++;docxPreviewReady=false;docxTranslationToken++;docxTranslationReady=false;docxTranslationHost=null;docxEditToken++;docxEditReady=false;docxEditHost=null;
  previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];translationPreviews={source:null,translated:null};translatedDocument=null;translationResultDocument=null;translationHistory=null;translationLineBaseline=null;organizeOrder=[];organizePreviewPages=[];selectedSplitPages=new Set();splitPreviewPages=[];workspaceSelectionIds=new Set();selectedConversion='';selectedCompression='balanced';
  if($('.page-view.visible')?.id!=='tool-view')previousView=$('.page-view.visible')?.id.replace('-view','')||'documents';
  pendingTask=task;selectedConversion=conversionPreset;taskPages=[];selectedTaskFiles=[];
  const configs={Translate:['Translate a document','Translate a PDF or Word document while keeping text anchored to its page.'],Edit:['Edit document text','Change PDF or Word text directly over the page at its original position.'],Organize:['Organize PDF pages','Reorder, rotate, and remove pages while keeping the document in view.'],Convert:['Convert files','Choose a card for PDF, Office, image, or text conversions.'],Merge:['Merge PDFs','Arrange your files, then combine them in that order.'],Split:['Split a PDF','Extract selected pages into a new PDF.'],Compress:['Compress a PDF','Reduce image weight with a selectable quality preset.'],Watermark:['Add a PDF watermark','Stamp a light, centered watermark across every page.'],Number:['Add page numbers','Add a clean page number to the bottom of every page.']};
  const [title,desc]=configs[task]||configs.Translate; $('#tool-title').textContent=title; $('#tool-description').textContent=desc;
  const accepts=['Translate','Edit'].includes(task)?'application/pdf,.pdf,.docx':['Organize','Merge','Split','Compress','Watermark','Number'].includes(task)?'application/pdf,.pdf':'.pdf,.docx,.pptx,.xlsx,.txt,image/*';
  const multiple=task==='Merge'||task==='Convert'?'multiple':'';
  let fields=`<div class="tool-field"><label for="task-files">${task==='Merge'?'Choose two or more PDFs':task==='Convert'?'Choose PDF, DOCX, PPTX, XLSX, text, or image files':['Translate','Edit'].includes(task)?'Choose a PDF or Word DOCX file':'Choose a PDF file'}</label><input id="task-files" type="file" accept="${accepts}" ${multiple} /><span class="field-help">Files stay on this device. Nothing is uploaded.</span></div><div class="workspace-file-picker" id="workspace-file-picker" hidden><label>Or choose from this workspace</label><div class="workspace-file-options" id="workspace-file-options"></div><div class="workspace-picker-footer"><span id="workspace-selection-count">0 selected</span><button class="secondary-button" id="load-workspace-files" type="button" disabled>Use selected files</button></div></div>`;
  if(task==='Split') fields+=`<div class="tool-field"><label for="page-range">Or enter page numbers</label><input id="page-range" placeholder="e.g. 1–4, 7, 10–12" /><span class="field-help">Page numbers start at 1. You can also select pages from the preview below.</span></div>`;
  if(task==='Organize') fields+=`<div class="position-note">✧ <span>Move pages with the arrows, rotate a page in 90° steps, or remove pages. The source file is never changed.</span></div>`;
  if(task==='Compress') fields+=`<div class="conversion-choice-field"><div class="conversion-choice-label">Choose image quality</div><div class="compression-options" role="group" aria-label="Compression quality"><button type="button" class="conversion-option-card ${selectedCompression==='compact'?'selected':''}" data-compression-option="compact" aria-pressed="${selectedCompression==='compact'}"><span class="conversion-option-icon">↓</span><span><strong>Compact</strong><small>Smaller files · 86 dpi · JPEG quality 62</small></span><span class="conversion-option-check">✓</span></button><button type="button" class="conversion-option-card ${selectedCompression==='balanced'?'selected':''}" data-compression-option="balanced" aria-pressed="${selectedCompression==='balanced'}"><span class="conversion-option-icon">◈</span><span><strong>Balanced</strong><small>Everyday use · 119 dpi · JPEG quality 78</small></span><span class="conversion-option-check">✓</span></button><button type="button" class="conversion-option-card ${selectedCompression==='quality'?'selected':''}" data-compression-option="quality" aria-pressed="${selectedCompression==='quality'}"><span class="conversion-option-icon">✧</span><span><strong>Higher quality</strong><small>Sharper pages · 180 dpi · may not reduce size</small></span><span class="conversion-option-check">✓</span></button></div><div class="position-note position-note-warning">Compression redraws each page as a JPEG image. The layout stays visible, but text, links, and forms won’t remain searchable or editable.</div><span id="compression-progress" class="field-help"></span></div>`;
  if(task==='Watermark') fields+=`<div class="tool-field"><label for="watermark-text">Watermark text</label><input id="watermark-text" maxlength="48" placeholder="CONFIDENTIAL" /><span class="field-help">A subtle diagonal stamp is added to each page. Your source PDF stays untouched.</span></div>`;
  if(task==='Number') fields+=`<div class="position-note">✧ <span>Page numbers are placed at the bottom center with consistent spacing across the document.</span></div>`;
  if(task==='Convert') fields+=`<div class="conversion-choice-field"><div class="conversion-choice-label">Choose an output</div><div class="conversion-options" id="conversion-options"></div><span class="field-help" id="conversion-help">Choose files to see the conversions available.</span></div><section class="docx-conversion-preview" id="docx-conversion-preview" hidden></section>`;
  if(task==='Translate') fields+=`<input type="hidden" id="source-language" value="en" /><input type="hidden" id="target-language" value="ja" /><input type="hidden" id="translation-mode" value="smart" /><div class="language-pair"><div class="tool-field"><label>Translate from</label>${languagePicker('source-language','Translate from','en')}</div><button type="button" class="language-swap" data-language-swap aria-label="Swap source and target languages">⇄</button><div class="tool-field"><label>Translate to</label>${languagePicker('target-language','Translate to','ja')}</div></div><div class="translation-mode-options" role="group" aria-label="Translation method"><button type="button" class="translation-mode-option selected" data-translation-mode="smart" aria-pressed="true"><strong>Smart</strong><span>On device first</span></button><button type="button" class="translation-mode-option" data-translation-mode="local" aria-pressed="false"><strong>On device</strong><span>Private only</span></button><button type="button" class="translation-mode-option" data-translation-mode="online" aria-pressed="false"><strong>DeepL online</strong><span>1M free chars · one-time</span></button></div><label class="translation-consent"><input type="checkbox" id="translation-consent" /><span><strong>Allow online translation</strong><small>New DeepL Developer accounts include 1 million free characters total, not monthly. Other plans may be paid. Smart mode uses DeepL only if local translation is unavailable; online mode sends selected text. A local bridge is required, and no API key is stored in this page.</small></span></label><div id="translation-status" class="translation-status" data-state="checking" role="status" aria-live="polite"><i></i><span>Checking on-device translation…</span></div><div class="position-note">✧ <span>Translate related text blocks together, then compare the full pages before downloading.</span></div>`;
  if(task==='Edit') fields+=`<div class="position-note">✧ <span>Changing text keeps its original anchor. The edited PDF is image-backed to preserve visual fidelity.</span></div>`;
  if(task==='Merge') fields+=`<div id="merge-order" class="merge-order" hidden></div>`;
  if(task==='Edit'||task==='Translate'||task==='Organize'||task==='Split') fields+=`<div id="line-editor" class="line-editor" hidden></div>`;
  $('#tool-content').innerHTML=fields;
  $('#tool-cta').innerHTML=task==='Merge'?'Merge PDFs <span>↗</span>':task==='Split'?'Extract pages <span>↗</span>':task==='Organize'?'Save organized PDF <span>↗</span>':task==='Translate'?'Translate document <span>↗</span>':task==='Edit'?'Export edited PDF <span>↗</span>':task==='Compress'?'Compress PDF <span>↗</span>':task==='Watermark'?'Add watermark <span>↗</span>':task==='Number'?'Add page numbers <span>↗</span>':'Convert and download <span>↗</span>';
  $('#tool-cta').disabled=true;
  $('#task-files').addEventListener('change',loadTaskFiles);
  $('#page-range')?.addEventListener('input',()=>{if($('#page-range').value.trim()){selectedSplitPages.clear();$$('[data-split-page]').forEach(card=>card.setAttribute('aria-pressed','false'));const count=$('#split-selection-count');if(count)count.textContent='0 selected'}updateTaskCta()});
  $('#watermark-text')?.addEventListener('input',updateTaskCta);
  $('#load-workspace-files').addEventListener('click',loadWorkspaceSelection);
  populateWorkspacePicker(task);
  setView('tool');
  updateTaskCta();
  if(task==='Translate')refreshTranslationAvailability();
}
async function loadTaskFiles(event){
  discardTranslationResult();
  selectedTaskFiles=[...event.target.files];
  if(pendingTask==='Translate'){docxTranslationToken++;docxTranslationReady=false;docxTranslationHost=null}
  if(pendingTask==='Edit'){docxEditToken++;docxEditReady=false;docxEditHost=null}
  updateTaskCta();
  syncDocxConversionPreview();
  await addFiles(selectedTaskFiles);
  await analyzeTaskFiles();
  updateTaskCta();
}
async function populateWorkspacePicker(task){
  const picker=$('#workspace-file-picker'),root=$('#workspace-file-options');if(!picker||!root)return;
  try{
    const records=await WorkspaceStore.list(),isPdfOnly=['Organize','Split','Merge','Compress','Watermark','Number'].includes(task);
    const eligible=records.filter(record=>{const name=record.name.toLowerCase(),isPdf=name.endsWith('.pdf'),isWord=name.endsWith('.docx'),isVideo=record.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/.test(name);return isPdfOnly?isPdf:['Translate','Edit'].includes(task)?isPdf||isWord:task==='Convert'?!isVideo:true});
    root.innerHTML=eligible.map(record=>`<button type="button" class="workspace-file-option" data-workspace-file-id="${esc(record.id)}" aria-pressed="false"><span class="workspace-option-icon ${iconTypes[(record.name.split('.').pop()||'').toLowerCase()]||'docx'}">${esc((record.name.split('.').pop()||'FILE').toUpperCase().slice(0,4))}</span><span class="workspace-option-copy"><strong>${esc(record.name)}</strong><small>${record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`}</small></span><span class="workspace-option-check">✓</span></button>`).join('');
    picker.hidden=!eligible.length;
  }catch{picker.hidden=true}
}
async function loadWorkspaceSelection(){
  const ids=[...workspaceSelectionIds];
  if(!ids.length){toast('Choose a saved file first.');return}
  try{discardTranslationResult();const records=await Promise.all(ids.map(id=>WorkspaceStore.get(id)));selectedTaskFiles=records.filter(Boolean).map(record=>record.file);if(pendingTask==='Translate'){docxTranslationToken++;docxTranslationReady=false;docxTranslationHost=null}if(pendingTask==='Edit'){docxEditToken++;docxEditReady=false;docxEditHost=null}updateTaskCta();syncDocxConversionPreview();await analyzeTaskFiles();updateTaskCta();toast(`${selectedTaskFiles.length} saved file${selectedTaskFiles.length===1?'':'s'} loaded.`)}catch(error){toast(error.message)}
}
async function renderDocxEditWorkspace(file){
  const root=$('#line-editor');if(!root)return;
  const token=++docxEditToken;docxEditReady=false;docxEditHost=null;root.hidden=false;
  root.innerHTML='<div class="document-preview-heading"><div><strong>Word page editor</strong><span>Preparing editable page positions…</span></div><div class="document-preview-actions"><button class="secondary-button reset-edit-button" id="undo-docx-edit" type="button" disabled aria-label="Undo last edit">↶ Undo</button><button class="secondary-button reset-edit-button" id="redo-docx-edit" type="button" disabled aria-label="Redo last undone edit">↷ Redo</button><button class="secondary-button reset-edit-button" id="reset-docx-edits" type="button" disabled>Reset edits</button><button class="secondary-button reset-edit-button" id="export-edited-docx" type="button" disabled>Download edited DOCX</button></div></div><div class="position-note">Edit body paragraphs over their original page positions. Use Undo/Redo or Ctrl/⌘ Z to revise edits. Word export updates matched paragraph text; long edits can reflow in Word. PDF export is image-backed for visual fidelity.</div><div class="document-preview-loading"><span class="preview-spinner"></span><span>Rendering Word pages…</span></div><div class="docx-preview-host" aria-label="Editable Word document pages"></div>';
  const host=root.querySelector('.docx-preview-host');
  try{
    const pageCount=await DocumentEngine.renderDocxPreview(file,host);
    if(token!==docxEditToken||pendingTask!=='Edit')return;
    host.addEventListener('transformo:docx-edit-change',event=>{const reset=root.querySelector('#reset-docx-edits'),exportButton=root.querySelector('#export-edited-docx'),undo=root.querySelector('#undo-docx-edit'),redo=root.querySelector('#redo-docx-edit');if(reset)reset.disabled=!event.detail.modifiedBlocks;if(exportButton)exportButton.disabled=!event.detail.modifiedBlocks;if(undo)undo.disabled=!event.detail.canUndo;if(redo)redo.disabled=!event.detail.canRedo;const note=root.querySelector('.position-note');if(!note)return;const count=event.detail.overflowBlocks;note.classList.toggle('position-note-warning',count>0);note.textContent=count?(count===1?'1 paragraph still exceeds its original page box. Review the edited page before export.':`${count} paragraphs still exceed their original page boxes. Review the edited page before export.`):'Download an editable Word file or an image-backed PDF. Word may reflow longer replacement text.'});
    const {blocks}=DocumentEngine.createDocxEditOverlay(host);
    root.querySelector('#undo-docx-edit').addEventListener('click',()=>DocumentEngine.undoDocxEdit(host));
    root.querySelector('#redo-docx-edit').addEventListener('click',()=>DocumentEngine.redoDocxEdit(host));
    root.querySelector('#reset-docx-edits').addEventListener('click',()=>{DocumentEngine.resetDocxEdit(host);toast('Word text reset to the original.');});
    const exportDocxButton=root.querySelector('#export-edited-docx');
    exportDocxButton.addEventListener('click',async()=>{
      exportDocxButton.disabled=true;exportDocxButton.textContent='Preparing Word file…';
      try{const result=await DocumentEngine.exportDocxEditedDocx(file,host);DocumentEngine.download(result.blob,result.filename);toast(`Edited Word file ready · ${result.updatedParagraphs} paragraph${result.updatedParagraphs===1?'':'s'} updated${result.skippedParagraphs?` · ${result.skippedParagraphs} unmatched paragraph${result.skippedParagraphs===1?' was':'s were'} left unchanged`:''}.`)}catch(error){toast(error.message||'The edited Word file could not be created.')}
      finally{exportDocxButton.textContent='Download edited DOCX';exportDocxButton.disabled=![...host.querySelectorAll('.docx-editing-block')].some(overlay=>overlay.textContent!==overlay.dataset.originalText)}
    });
    root.querySelector('.document-preview-loading')?.remove();
    docxEditHost=host;docxEditReady=true;
    root.querySelector('.document-preview-heading span').textContent=`${pageCount} page${pageCount===1?'':'s'} · ${blocks} editable paragraph${blocks===1?'':'s'}`;
    const tabs=document.createElement('div');tabs.className='docx-translation-tabs document-preview-tabs';tabs.innerHTML='<button type="button" class="document-preview-tab" data-docx-edit-view="original">Original</button><button type="button" class="document-preview-tab active" data-docx-edit-view="edited">Edited</button>';
    root.querySelector('.document-preview-heading').append(tabs);
    tabs.addEventListener('click',event=>{const button=event.target.closest('[data-docx-edit-view]');if(!button)return;DocumentEngine.setDocxEditMode(host,button.dataset.docxEditView);tabs.querySelectorAll('[data-docx-edit-view]').forEach(tab=>tab.classList.toggle('active',tab===button))});
    updateTaskCta();
  }catch(error){
    if(token!==docxEditToken)return;
    root.innerHTML=`<div class="position-note position-note-warning">${esc(error.message||'The Word page editor could not be prepared.')}</div>`;
    updateTaskCta();throw error;
  }
}
async function renderDocxTranslationWorkspace(file){
  const root=$('#line-editor');if(!root)return;
  const token=++docxTranslationToken;docxTranslationReady=false;docxTranslationHost=null;root.hidden=false;
  root.innerHTML='<div class="document-preview-heading"><div><strong>Word page translation</strong><span>Preparing the rendered pages…</span></div><div class="document-preview-actions"><button type="button" class="secondary-button reset-edit-button" id="undo-translation" disabled>↶ Undo translation</button><button type="button" class="secondary-button reset-edit-button" id="redo-translation" disabled>↷ Redo translation</button><button type="button" class="secondary-button reset-edit-button" id="download-translated-docx" disabled>Download translated Word</button></div></div><div class="position-note">Paragraphs translate in their original page boxes. Longer translations may need review. Download the editable Word file or an image-backed PDF.</div><div class="document-preview-loading"><span class="preview-spinner"></span><span>Rendering Word pages…</span></div><div class="docx-preview-host" aria-label="Word document page preview"></div>';
  const host=root.querySelector('.docx-preview-host');
  try{
    const pageCount=await DocumentEngine.renderDocxPreview(file,host);
    if(token!==docxTranslationToken||pendingTask!=='Translate')return;
    root.querySelector('.document-preview-loading')?.remove();
    docxTranslationHost=host;docxTranslationReady=true;
    root.querySelector('.document-preview-heading span').textContent=`${pageCount} page${pageCount===1?'':'s'} · review before translating`;
    const note=root.querySelector('.position-note');
    note.textContent='Compare the original and translated pages. Download an editable DOCX with matched source paragraphs, or a visual PDF for fixed page layout.';
    const tabs=document.createElement('div');tabs.className='docx-translation-tabs document-preview-tabs';tabs.innerHTML='<button type="button" class="document-preview-tab active" data-docx-preview="original">Original</button><button type="button" class="document-preview-tab" data-docx-preview="translated" disabled>Translated</button>';
    root.querySelector('.document-preview-actions').prepend(tabs);
    tabs.addEventListener('click',event=>{const button=event.target.closest('[data-docx-preview]');if(!button||button.disabled)return;DocumentEngine.setDocxTranslationMode(host,button.dataset.docxPreview);tabs.querySelectorAll('[data-docx-preview]').forEach(tab=>tab.classList.toggle('active',tab===button))});
    root.querySelector('#undo-translation').addEventListener('click',undoTranslation);root.querySelector('#redo-translation').addEventListener('click',redoTranslation);
    const wordExport=root.querySelector('#download-translated-docx');
    wordExport.addEventListener('click',async()=>{wordExport.disabled=true;wordExport.textContent='Creating Word file…';try{const result=await DocumentEngine.exportDocxTranslatedDocx(file,host);DocumentEngine.download(result.blob,result.filename);toast(`Translated Word file ready · ${result.updatedParagraphs} paragraph${result.updatedParagraphs===1?'':'s'} updated${result.skippedParagraphs?` · ${result.skippedParagraphs} unmatched paragraph${result.skippedParagraphs===1?' was':'s were'} left unchanged`:''}.`)}catch(error){toast(error.message||'The translated Word file could not be created.')}finally{wordExport.textContent='Download translated Word';wordExport.disabled=!translatedDocument}});
    updateTranslationHistoryControls();
    updateTaskCta();
  }catch(error){
    if(token!==docxTranslationToken)return;
    root.innerHTML=`<div class="position-note position-note-warning">${esc(error.message||'The Word page preview could not be prepared.')}</div>`;
    updateTaskCta();throw error;
  }
}
function syncDocxConversionPreview(){
  const root=$('#docx-conversion-preview');if(!root)return;
  const token=++docxPreviewToken;docxPreviewReady=false;
  if(pendingTask!=='Convert'||!['docx-pdf','docx-png','docx-jpg'].includes(selectedConversion)){
    root.hidden=true;root.replaceChildren();updateTaskCta();return;
  }
  root.hidden=false;
  if(conversionType()!=='docx'||selectedTaskFiles.length!==1){
    root.innerHTML='<div class="position-note position-note-warning">Choose one DOCX file to preview and export as pages. Use DOCX → text for batch extraction.</div>';
    updateTaskCta();return;
  }
  const file=selectedTaskFiles[0];
  const note=selectedConversion==='docx-pdf'?'The PDF keeps the page appearance as images. Fonts and page breaks can differ from Microsoft Word, and the exported text will not be searchable.':'Image output follows the browser-rendered page preview. Fonts and page breaks can differ from Microsoft Word.';
  root.innerHTML=`<div class="document-preview-heading"><div><strong>Word page preview</strong><span>Preparing the document pages…</span></div></div><div class="position-note">${note}</div><div class="docx-preview-host" aria-label="Word document page preview"></div>`;
  const host=root.querySelector('.docx-preview-host');
  DocumentEngine.renderDocxPreview(file,host).then(pageCount=>{
    if(token!==docxPreviewToken)return;
    host.__transformoSourceFile=file;
    root.querySelector('.document-preview-heading span').textContent=`${pageCount} page${pageCount===1?'':'s'} · review before export`;
    docxPreviewReady=true;updateTaskCta();
  }).catch(error=>{
    if(token!==docxPreviewToken)return;
    root.querySelector('.docx-preview-host')?.remove();
    root.insertAdjacentHTML('beforeend',`<div class="position-note position-note-warning">${esc(error.message||'The Word preview could not be prepared.')}</div>`);
    updateTaskCta();
  });
  updateTaskCta();
}
async function analyzeTaskFiles(){
  if(!selectedTaskFiles.length)return;
  if((pendingTask==='Edit'||pendingTask==='Translate')&&selectedTaskFiles.length===1){
    try{const isDocx=selectedTaskFiles[0].name.toLowerCase().endsWith('.docx');if(isDocx&&pendingTask==='Translate'){await renderDocxTranslationWorkspace(selectedTaskFiles[0]);toast('Word document ready · translate and review it on the page.')}else if(isDocx&&pendingTask==='Edit'){await renderDocxEditWorkspace(selectedTaskFiles[0]);toast('Word document ready · edit the page text in place.')}else{taskPages=await DocumentEngine.inspectPdf(selectedTaskFiles[0]);if(pendingTask==='Translate')await renderTranslationPreview(selectedTaskFiles[0]);else await renderVisualPdfEditor(selectedTaskFiles[0]);toast(`Document ready · ${taskPages.length} page${taskPages.length===1?'':'s'}.`)}}catch(error){toast(error.message)}
  } else if(pendingTask==='Organize'&&selectedTaskFiles.length===1){
    try{await renderOrganizeWorkspace(selectedTaskFiles[0])}catch(error){toast(error.message)}
  } else if(pendingTask==='Split'&&selectedTaskFiles.length===1){
    try{await renderSplitWorkspace(selectedTaskFiles[0])}catch(error){toast(error.message)}
  } else if(pendingTask==='Merge'){
    renderMergeWorkspace();
  } else toast(`${selectedTaskFiles.length} file${selectedTaskFiles.length===1?'':'s'} ready.`);
}
function renderMergeWorkspace(){
  const root=$('#merge-order');if(!root)return;root.hidden=false;
  root.innerHTML=`<div class="document-preview-heading"><div><strong>Arrange your files</strong><span>Use the arrows to choose the order of pages in the merged PDF.</span></div><span class="organize-status">${selectedTaskFiles.length} selected</span></div><div class="merge-file-list">${selectedTaskFiles.map((file,index)=>`<article class="merge-file-card" data-merge-position="${index}"><span class="merge-file-order">${String(index+1).padStart(2,'0')}</span><span class="workspace-option-icon pdf">PDF</span><span class="merge-file-name">${esc(file.name)}</span><div class="merge-file-actions"><button type="button" data-merge-action="up" aria-label="Move ${esc(file.name)} up" ${index===0?'disabled':''}>↑</button><button type="button" data-merge-action="down" aria-label="Move ${esc(file.name)} down" ${index===selectedTaskFiles.length-1?'disabled':''}>↓</button><button type="button" data-merge-action="remove" aria-label="Remove ${esc(file.name)}">×</button></div></article>`).join('')}</div>`;
  root.querySelector('.merge-file-list').addEventListener('click',event=>{const button=event.target.closest('[data-merge-action]');if(!button)return;const position=Number(button.closest('[data-merge-position]').dataset.mergePosition),action=button.dataset.mergeAction;if(action==='remove')selectedTaskFiles.splice(position,1);if(action==='up'&&position>0)[selectedTaskFiles[position-1],selectedTaskFiles[position]]=[selectedTaskFiles[position],selectedTaskFiles[position-1]];if(action==='down'&&position<selectedTaskFiles.length-1)[selectedTaskFiles[position+1],selectedTaskFiles[position]]=[selectedTaskFiles[position],selectedTaskFiles[position+1]];renderMergeWorkspace();updateTaskCta()});
}
async function renderSplitWorkspace(file){
  const root=$('#line-editor');if(!root)return;root.hidden=false;root.innerHTML='<div class="document-preview-loading"><span class="preview-spinner"></span><span>Preparing page selection…</span></div>';
  selectedSplitPages=new Set();$('#page-range').value='';splitPreviewPages.forEach(page=>URL.revokeObjectURL(page.url));splitPreviewPages=[];
  const preview=await DocumentEngine.renderPdfPages(file,.42,80);
  splitPreviewPages=preview.pages.map(page=>({number:page.number,url:URL.createObjectURL(page.blob)}));
  splitPreviewPages.forEach(page=>previewUrls.push(page.url));
  const cards=splitPreviewPages.map(page=>`<button type="button" class="split-page-card" data-split-page="${page.number}" aria-pressed="false"><span class="split-page-check">✓</span><span class="split-page-number">${page.number}</span><img src="${page.url}" alt="Select page ${page.number}" loading="lazy" /></button>`).join('');
  root.innerHTML=`<div class="document-preview-heading"><div><strong>Select pages to extract</strong><span>Choose one or more pages. Selected pages become a new PDF.</span></div><span class="organize-status" id="split-selection-count">0 selected</span></div><div class="split-page-grid">${cards}</div>${preview.total>preview.pages.length?`<div class="preview-limit-note">Previewing the first ${preview.pages.length} of ${preview.total} pages. Enter any page range above to include later pages.</div>`:''}`;
  root.querySelector('.split-page-grid').addEventListener('click',event=>{const card=event.target.closest('[data-split-page]');if(!card)return;$('#page-range').value='';const page=Number(card.dataset.splitPage);if(selectedSplitPages.has(page)){selectedSplitPages.delete(page);card.setAttribute('aria-pressed','false')}else{selectedSplitPages.add(page);card.setAttribute('aria-pressed','true')}root.querySelector('#split-selection-count').textContent=`${selectedSplitPages.size} selected`;updateTaskCta()});
  updateTaskCta();
}
async function renderOrganizeWorkspace(file){
  const root=$('#line-editor');if(!root)return;root.hidden=false;root.innerHTML='<div class="document-preview-loading"><span class="preview-spinner"></span><span>Preparing page organizer…</span></div>';
  organizePreviewPages.forEach(page=>URL.revokeObjectURL(page.url));organizePreviewPages=[];
  const preview=await DocumentEngine.renderPdfPages(file,.46,80);
  organizePreviewPages=preview.pages.map(page=>({number:page.number,url:URL.createObjectURL(page.blob)}));
  organizePreviewPages.forEach(page=>previewUrls.push(page.url));
  organizeOrder=organizePreviewPages.map(page=>({index:page.number-1,rotation:0}));
  renderOrganizePages(preview.total);
}
function renderOrganizePages(total=organizePreviewPages.length){
  const root=$('#line-editor');if(!root)return;
  const visibleOrder=organizeOrder.slice(0,organizePreviewPages.length);
  const cards=visibleOrder.map((item,position)=>{
    const page=organizePreviewPages.find(entry=>entry.number===item.index+1);if(!page)return'';
    const transform=item.rotation%180?`rotate(${item.rotation}deg) scale(.68)`:`rotate(${item.rotation}deg)`;
    return `<article class="organize-page-card" data-page-position="${position}"><div class="organize-page-preview"><img src="${page.url}" alt="Page ${item.index+1}" loading="lazy" style="transform:${transform}" /><span class="organize-page-number">${String(item.index+1).padStart(2,'0')}</span><button type="button" class="organize-remove" data-page-action="remove" aria-label="Remove page ${item.index+1}">×</button></div><div class="organize-page-actions"><span>Page ${item.index+1}</span><div><button type="button" data-page-action="up" aria-label="Move page ${item.index+1} earlier" ${position===0?'disabled':''}>↑</button><button type="button" data-page-action="down" aria-label="Move page ${item.index+1} later" ${position===organizeOrder.length-1?'disabled':''}>↓</button><button type="button" data-page-action="rotate" aria-label="Rotate page ${item.index+1}">↻</button></div></div></article>`;
  }).join('');
  const kept=total-(organizePreviewPages.length-organizeOrder.length);
  root.innerHTML=`<div class="document-preview-heading"><div><strong>${total} pages · ${kept} kept</strong><span>Reorder, rotate, or remove pages in the preview below.</span></div><span class="organize-status">${kept} pages</span></div><div class="organize-page-grid">${cards}</div>${total>organizePreviewPages.length?`<div class="preview-limit-note">Showing the first ${organizePreviewPages.length} pages. Later pages stay in their original order after these.</div>`:''}`;
  root.querySelector('.organize-page-grid').addEventListener('click',event=>{
    const button=event.target.closest('[data-page-action]');if(!button)return;
    const card=button.closest('[data-page-position]'),position=Number(card.dataset.pagePosition),action=button.dataset.pageAction;
    if(action==='remove'){if(organizeOrder.length===1){toast('Keep at least one page in the document.');return}organizeOrder.splice(position,1)}
    if(action==='rotate')organizeOrder[position].rotation=(organizeOrder[position].rotation+90)%360;
    if(action==='up'&&position>0)[organizeOrder[position-1],organizeOrder[position]]=[organizeOrder[position],organizeOrder[position-1]];
    if(action==='down'&&position<organizeOrder.length-1)[organizeOrder[position+1],organizeOrder[position]]=[organizeOrder[position],organizeOrder[position+1]];
    renderOrganizePages(total);
  });
}
function ocrPanel(){return `<div class="position-note">Some pages are scans. Read them with OCR to make the text editable and translatable.</div><input type="hidden" id="ocr-language" value="eng" /><div class="ocr-controls">${ocrLanguagePicker()}<button class="secondary-button" id="run-ocr" type="button">Read scanned pages</button><span id="ocr-progress" class="field-help"></span></div>`}
async function renderVisualPdfEditor(file){
  const root=$('#line-editor');if(!root)return;root.hidden=false;root.innerHTML='<div class="document-preview-loading"><span class="preview-spinner"></span><span>Opening pages for editing…</span></div>';
  const preview=await DocumentEngine.renderPdfPages(file,0.55,80),old=translationPreviews.source;
  old?.pages.forEach(page=>{URL.revokeObjectURL(page.url);previewUrls=previewUrls.filter(url=>url!==page.url)});
  translationPreviews.source={total:preview.total,pages:preview.pages.map(page=>{const url=URL.createObjectURL(page.blob);previewUrls.push(url);return{number:page.number,url}})};
  const needsOcr=taskPages.some(page=>!page.lines.length),offsets=[];let cursor=0;
  for(const page of taskPages){offsets.push(cursor);cursor+=page.lines.length}
  const pages=preview.pages.map((image,index)=>{
    const page=taskPages[index],width=page?.width||1,height=page?.height||1;
    const fields=(page?.lines||[]).map((line,lineIndex)=>{const top=Math.max(0,Math.min(99,(height-line.y-line.height*.9)/height*100)),left=Math.max(0,Math.min(99,line.x/width*100)),boxWidth=Math.max(.8,Math.min(100-left,line.width/width*100)),boxHeight=Math.max(.8,Math.min(16,line.height/height*150)),fontSize=Math.max(4,Math.min(14,line.size*.55));return `<textarea class="page-text-edit" aria-label="Edit page ${index+1} text" data-line-index="${offsets[index]+lineIndex}" rows="1" spellcheck="false" style="left:${left}%;top:${top}%;width:${boxWidth}%;height:${boxHeight}%;font-size:${fontSize}px">${esc(line.edited??line.text)}</textarea>`}).join('');
    return `<figure class="edit-document-page"><div class="edit-page-canvas" style="aspect-ratio:${width}/${height}"><img src="${image.url}" alt="Page ${index+1}" loading="lazy" />${fields}</div><figcaption>PAGE ${String(index+1).padStart(2,'0')} <span>${page?.lines.length||0} editable text areas</span></figcaption></figure>`;
  }).join('');
  root.innerHTML=`<div class="document-preview-heading"><div><strong>Edit directly on the page</strong><span>Click a text area to change it. Edits stay anchored to the page; use Undo or Redo to revise them.</span></div><div class="document-preview-actions"><button class="secondary-button reset-edit-button" id="undo-pdf-edit" type="button" disabled aria-label="Undo last edit">↶ Undo</button><button class="secondary-button reset-edit-button" id="redo-pdf-edit" type="button" disabled aria-label="Redo last undone edit">↷ Redo</button><button class="secondary-button reset-edit-button" id="reset-pdf-edits" type="button" disabled>Reset edits</button></div></div>${needsOcr?ocrPanel():''}<div class="edit-document-grid">${pages}</div>${preview.total>preview.pages.length?`<div class="preview-limit-note">Editing preview shows ${preview.pages.length} of ${preview.total} pages. The remaining pages will stay unchanged in the export.</div>`:''}`;
  const resetButton=root.querySelector('#reset-pdf-edits'),undoButton=root.querySelector('#undo-pdf-edit'),redoButton=root.querySelector('#redo-pdf-edit'),originalLines=taskPages.flatMap(page=>page.lines),editGrid=root.querySelector('.edit-document-grid'),fields=[...editGrid.querySelectorAll('.page-text-edit')];
  const readSnapshot=()=>fields.map(field=>field.value),sameSnapshot=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);
  const editHistory=TransformoEditHistory.createEditHistory(readSnapshot());let historyTimer;
  const syncModel=()=>fields.forEach(field=>{const line=originalLines[Number(field.dataset.lineIndex)];if(!line)return;if(field.value===line.text)delete line.edited;else line.edited=field.value;delete line.translationBlockId;delete line.translationText});
  const updateHistoryControls=()=>{const current=readSnapshot(),pending=!sameSnapshot(current,editHistory.current);resetButton.disabled=!fields.some(field=>field.value!==originalLines[Number(field.dataset.lineIndex)]?.text);undoButton.disabled=!editHistory.canUndo&&!pending;redoButton.disabled=!editHistory.canRedo||pending};
  const pushSnapshot=()=>{clearTimeout(historyTimer);historyTimer=null;editHistory.record(readSnapshot());updateHistoryControls()};
  const moveHistory=direction=>{clearTimeout(historyTimer);historyTimer=null;const current=readSnapshot(),snapshot=direction<0?editHistory.undo(current):editHistory.redo(current);if(!snapshot){updateHistoryControls();return}fields.forEach((field,index)=>{field.value=snapshot[index]??''});syncModel();updateHistoryControls()};
  editGrid.addEventListener('input',event=>{if(!event.target.matches('.page-text-edit'))return;syncModel();updateHistoryControls();clearTimeout(historyTimer);historyTimer=setTimeout(pushSnapshot,400)});
  editGrid.addEventListener('focusout',event=>{if(event.target.matches('.page-text-edit'))pushSnapshot()});
  editGrid.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase(),undo=key==='z'&&!event.shiftKey,redo=key==='y'||(key==='z'&&event.shiftKey);if(!undo&&!redo)return;event.preventDefault();moveHistory(undo?-1:1)});
  undoButton.addEventListener('click',()=>moveHistory(-1));redoButton.addEventListener('click',()=>moveHistory(1));
  resetButton.addEventListener('click',()=>{pushSnapshot();fields.forEach(field=>{field.value=originalLines[Number(field.dataset.lineIndex)]?.text||''});syncModel();pushSnapshot();updateHistoryControls();toast('PDF text reset to the original.');});
  updateHistoryControls();
  if(needsOcr)root.querySelector('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);
}
function drawTranslationPreview(mode){
  const root=$('#translation-page-view');if(!root)return;
  root.classList.toggle('document-page-comparison',mode==='compare');
  if(mode==='compare'){
    const source=translationPreviews.source,translated=translationPreviews.translated;if(!source||!translated)return;
    const pageCount=Math.min(source.pages.length,translated.pages.length);
    root.innerHTML=source.pages.slice(0,pageCount).map((page,index)=>{const translatedPage=translated.pages[index];return`<section class="compare-page-pair"><div class="compare-page-heading">PAGE ${String(page.number).padStart(2,'0')}</div><div class="compare-page-sides"><figure class="compare-page-side"><figcaption>Original</figcaption><img src="${page.url}" alt="Original document page ${page.number}" loading="lazy" /></figure><figure class="compare-page-side"><figcaption>Translated</figcaption><img src="${translatedPage.url}" alt="Translated document page ${translatedPage.number}" loading="lazy" /></figure></div></section>`}).join('')+(Math.max(source.total,translated.total)>pageCount?`<div class="preview-limit-note">Comparing the first ${pageCount} pages. The full document is included in the translated PDF.</div>`:'');
  }else{
    const preview=translationPreviews[mode];if(!preview)return;
    root.innerHTML=preview.pages.map(page=>`<figure class="document-page-card"><img src="${page.url}" alt="${mode==='source'?'Original':'Translated'} document page ${page.number}" loading="lazy" /><figcaption><span>PAGE ${String(page.number).padStart(2,'0')}</span><span>${mode==='source'?'Original':'Translated'}</span></figcaption></figure>`).join('')+(preview.total>preview.pages.length?`<div class="preview-limit-note">Previewing the first ${preview.pages.length} of ${preview.total} pages. The full document is included in translation.</div>`:'');
  }
  $$('.document-preview-tab[data-document-preview]').forEach(button=>{const selected=button.dataset.documentPreview===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
}
function capturePdfTranslationState(){return taskPages.flatMap(page=>page.lines.map(line=>JSON.stringify([line.edited??null,line.translationBlockId??null,line.translationText??null])))}
function restorePdfTranslationState(state){let index=0;for(const page of taskPages)for(const line of page.lines){const [edited,blockId,text]=JSON.parse(state[index++]||'[null,null,null]');if(edited===null)delete line.edited;else line.edited=edited;if(blockId===null)delete line.translationBlockId;else line.translationBlockId=blockId;if(text===null)delete line.translationText;else line.translationText=text}}
function updateTranslationHistoryControls(){const undo=$('#undo-translation'),redo=$('#redo-translation'),active=!!translatedDocument,hasResult=!!translationResultDocument;if(undo)undo.disabled=!active||!translationHistory?.canUndo;if(redo)redo.disabled=active||!hasResult||!translationHistory?.canRedo;const translatedTab=$('[data-document-preview="translated"]')||$('[data-docx-preview="translated"]'),compareTab=$('[data-document-preview="compare"]'),wordExport=$('#download-translated-docx');if(translatedTab)translatedTab.disabled=!active;if(compareTab)compareTab.disabled=!active;if(wordExport)wordExport.disabled=!active}
function undoTranslation(){if(!translationHistory||!translatedDocument)return;const isDocx=selectedTaskFiles[0]?.name.toLowerCase().endsWith('.docx'),state=translationHistory.undo(isDocx?['translated']:capturePdfTranslationState());if(!state)return;translationResultDocument=translatedDocument;translatedDocument=null;if(isDocx){DocumentEngine.setDocxTranslationMode(docxTranslationHost,'original');$$('[data-docx-preview]').forEach(tab=>tab.classList.toggle('active',tab.dataset.docxPreview==='original'))}else{restorePdfTranslationState(state);drawTranslationPreview('source')}updateTranslationHistoryControls();updateTaskCta();toast('Translation undone. The original stays unchanged; redo to restore this result.')}
function redoTranslation(){if(!translationHistory||translatedDocument||!translationResultDocument)return;const isDocx=selectedTaskFiles[0]?.name.toLowerCase().endsWith('.docx'),state=translationHistory.redo(isDocx?['original']:capturePdfTranslationState());if(!state)return;translatedDocument=translationResultDocument;if(isDocx){DocumentEngine.setDocxTranslationMode(docxTranslationHost,'translated');$$('[data-docx-preview]').forEach(tab=>tab.classList.toggle('active',tab.dataset.docxPreview==='translated'))}else{restorePdfTranslationState(state);drawTranslationPreview('translated')}updateTranslationHistoryControls();updateTaskCta();toast('Translation restored.')}
async function renderTranslationPreview(file){
  const root=$('#line-editor');if(!root)return;root.hidden=false;root.innerHTML='<div class="document-preview-loading"><span class="preview-spinner"></span><span>Preparing full-page document preview…</span></div>';
  const preview=await DocumentEngine.renderPdfPages(file);
  const mode=translatedDocument?'translated':'source',old=translationPreviews[mode];
  old?.pages.forEach(page=>{URL.revokeObjectURL(page.url);previewUrls=previewUrls.filter(url=>url!==page.url)});
  translationPreviews[mode]={total:preview.total,pages:preview.pages.map(page=>{const url=URL.createObjectURL(page.blob);previewUrls.push(url);return{number:page.number,url}})};
  const hasScannedPages=taskPages.some(page=>!page.lines.length),ocr=hasScannedPages?ocrPanel():'';
  const overflow=translatedDocument?.overflowLines?`<div class="position-note position-note-warning">${translatedDocument.overflowLines} translated text area${translatedDocument.overflowLines===1?' may':'s may'} overflow its original page region. Check the translated preview before downloading.</div>`:'';
  root.innerHTML=`<div class="document-preview-heading"><div><strong>${preview.total} page${preview.total===1?'':'s'} · full document</strong><span>Review the document as pages, not extracted text.</span></div><div class="document-preview-actions"><div class="document-preview-tabs" role="group" aria-label="Document comparison view"><button type="button" class="document-preview-tab active" data-document-preview="source" aria-pressed="${!translatedDocument}">Original</button><button type="button" class="document-preview-tab" data-document-preview="translated" aria-pressed="false" ${translatedDocument?'':'disabled'}>Translated</button><button type="button" class="document-preview-tab" data-document-preview="compare" aria-pressed="false" ${translatedDocument?'':'disabled'}>Compare</button></div><button type="button" class="secondary-button reset-edit-button" id="undo-translation" disabled>↶ Undo translation</button><button type="button" class="secondary-button reset-edit-button" id="redo-translation" disabled>↷ Redo translation</button></div></div>${ocr}${overflow}<div class="document-page-grid" id="translation-page-view"></div>`;
  root.querySelectorAll('[data-document-preview]').forEach(button=>button.addEventListener('click',()=>{const mode=button.dataset.documentPreview;if(mode==='compare'?translationPreviews.source&&translationPreviews.translated:translationPreviews[mode])drawTranslationPreview(mode)}));
  root.querySelector('#undo-translation').addEventListener('click',undoTranslation);root.querySelector('#redo-translation').addEventListener('click',redoTranslation);
  if(hasScannedPages)root.querySelector('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);
  drawTranslationPreview(translatedDocument?'translated':'source');updateTranslationHistoryControls();
}
function discardTranslationResult(){
  if(pendingTask!=='Translate')return;
  if(translationLineBaseline)restorePdfTranslationState(translationLineBaseline);
  translationPreviews.translated?.pages.forEach(page=>{URL.revokeObjectURL(page.url);previewUrls=previewUrls.filter(url=>url!==page.url)});
  translationPreviews.translated=null;translatedDocument=null;translationResultDocument=null;translationHistory=null;translationLineBaseline=null;
  if(docxTranslationHost){DocumentEngine.clearDocxTranslation(docxTranslationHost);DocumentEngine.setDocxTranslationMode(docxTranslationHost,'original')}
  const docxTab=$('[data-docx-preview="translated"]');if(docxTab)docxTab.disabled=true;
  const tab=$('[data-document-preview="translated"]');if(tab)tab.disabled=true;
  const compareTab=$('[data-document-preview="compare"]');if(compareTab)compareTab.disabled=true;
  if(translationPreviews.source)drawTranslationPreview('source');
  updateTranslationHistoryControls();updateTaskCta();
}
async function runOcrOnCurrentPdf(){
  if(!selectedTaskFiles[0]){toast('Choose a PDF first.');return}
  const button=$('#run-ocr'),progress=$('#ocr-progress');button.disabled=true;button.textContent='Starting OCR…';
  try{taskPages=await DocumentEngine.ocrPdf(selectedTaskFiles[0],$('#ocr-language').value,message=>{if(message.status==='recognizing text')button.textContent=`Reading pages ${Math.round(message.progress*100)}%…`;else if(message.status)button.textContent=`${message.status}…`},taskPages);if(pendingTask==='Translate')await renderTranslationPreview(selectedTaskFiles[0]);else await renderVisualPdfEditor(selectedTaskFiles[0]);const total=taskPages.reduce((n,p)=>n+p.lines.length,0);toast(total?`OCR is ready · ${total} text lines found across the pages.`:'OCR could not find readable text in this file.');}
  catch(error){progress.textContent=error.message;toast(error.message)}finally{const retry=$('#run-ocr');if(retry){retry.disabled=false;retry.textContent='Run OCR on this PDF'}}
}
function readEditedLines(){let index=0;for(const page of taskPages)for(const line of page.lines){const input=$(`[data-line-index="${index++}"]`);if(input)line.edited=input.value}}
async function translateCurrentLines(){
  if(!selectedTaskFiles[0]){toast('Choose a document first.');return}
  if(translationResultDocument&&!translatedDocument)discardTranslationResult();
  if(selectedTaskFiles[0].name.toLowerCase().endsWith('.docx')){
    if(!docxTranslationReady||!docxTranslationHost){toast('Wait for the Word page preview to finish.');return}
    if(!translationHistory)translationHistory=TransformoEditHistory.createEditHistory(['original']);
    const button=$('#tool-cta');button.disabled=true;
    try{
      const source=$('#source-language').value,target=$('#target-language').value,translationOptions=getTranslationOptions();
      const overflowLines=await DocumentEngine.translateDocxInPlace(docxTranslationHost,source,target,(done,total,detail)=>{button.textContent=detail?.stage==='download'?`Preparing translation model · ${Math.round(detail.progress*100)}%`:detail?.stage==='fallback'?'Switching to DeepL…':detail?.stage==='online'?`Translating online · ${done} of ${total}`:`Translating paragraphs · ${done} of ${total}`},translationOptions);
      button.textContent='Composing translated Word pages…';
      translatedDocument=await DocumentEngine.exportDocxTranslatedPdf(selectedTaskFiles[0],docxTranslationHost,overflowLines,(done,total)=>{button.textContent=`Creating PDF page ${done} of ${total}…`});
      translationHistory.record(['translated']);translationResultDocument=translatedDocument;updateTranslationHistoryControls();
      const tab=$('[data-docx-preview="translated"]');if(tab){tab.disabled=false;tab.click()}
      button.innerHTML='Download translated PDF <span>↗</span>';
      toast(overflowLines?`Translation ready · ${overflowLines} paragraph${overflowLines===1?' may':'s may'} overflow. Review the page preview.`:'Translated Word document ready · review the page preview before downloading.');
    }catch(error){DocumentEngine.clearDocxTranslation(docxTranslationHost);DocumentEngine.setDocxTranslationMode(docxTranslationHost,'original');translationHistory=null;translationResultDocument=null;translatedDocument=null;updateTranslationHistoryControls();toast(error.message||'The Word document could not be translated.')}
    finally{button.disabled=false;if(!translatedDocument)button.innerHTML='Translate document <span>↗</span>';updateTaskCta()}
    return;
  }
  if(!taskPages.length){toast('Choose a text-based PDF first.');return}
  if(!taskPages.some(page=>page.lines.length)){toast('Run OCR on the scanned pages before translating.');return}
  readEditedLines();if(!translationHistory){translationLineBaseline=capturePdfTranslationState();translationHistory=TransformoEditHistory.createEditHistory(translationLineBaseline)}
  const button=$('#tool-cta');button.disabled=true;
  try{
    await DocumentEngine.translateLines(taskPages,$('#source-language').value,$('#target-language').value,(done,total,detail)=>{button.textContent=detail?.stage==='download'?`Preparing translation model · ${Math.round(detail.progress*100)}%`:detail?.stage==='fallback'?'Switching to DeepL…':detail?.stage==='online'?`Translating online · ${done} of ${total}`:`Translating document · ${Math.round(done/Math.max(1,total)*100)}%`},getTranslationOptions());
    button.textContent='Composing translated pages…';
    translatedDocument=await DocumentEngine.exportPositionedPdf(selectedTaskFiles[0],taskPages,()=>{},true,$('#target-language').value);
    translationHistory.record(capturePdfTranslationState());translationResultDocument=translatedDocument;
    await renderTranslationPreview(translatedDocument.blob);
    const tab=$('[data-document-preview="translated"]');if(tab){tab.disabled=false;tab.click()}
    button.innerHTML='Download translated PDF <span>↗</span>';
    const textLayerNote=translatedDocument.searchableCharacters?`${translatedDocument.searchableCharacters} characters are searchable.`:'The visual PDF is ready; searchable text could not be added.';
    const skippedTextNote=translatedDocument.skippedSearchableCharacters?` ${translatedDocument.skippedSearchableCharacters} characters could not be indexed.`:'';
    toast(translatedDocument.overflowLines?`Translation ready · ${translatedDocument.overflowLines} text area${translatedDocument.overflowLines===1?' may':'s may'} overflow. ${textLayerNote}${skippedTextNote} Review the page preview.`:`Translated document ready · ${textLayerNote}${skippedTextNote} Review the page preview before downloading.`);
  }catch(error){discardTranslationResult();toast(error.message||'The document could not be translated.')}finally{button.disabled=false;if(!translatedDocument)button.innerHTML='Translate document <span>↗</span>';updateTaskCta()}
}
async function performCurrentTask(){
  const button=$('#tool-cta');button.disabled=true;const label=button.textContent;button.textContent='Working…';
  try{
    if(pendingTask==='Merge') toast(await DocumentEngine.mergePdfs(selectedTaskFiles));
    else if(pendingTask==='Watermark') toast(await DocumentEngine.watermarkPdf(selectedTaskFiles[0],$('#watermark-text').value));
    else if(pendingTask==='Number') toast(await DocumentEngine.numberPdf(selectedTaskFiles[0]));
    else if(pendingTask==='Compress'){
      if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');
      const progress=$('#compression-progress');
      const result=await DocumentEngine.compressPdf(selectedTaskFiles[0],selectedCompression,(done,total)=>{if(progress)progress.textContent=`Rendering page ${done} of ${total}…`});
      if(result.compressed)toast(`Reduced PDF by ${Math.round((1-result.outputBytes/result.originalBytes)*100)}% · ${(result.outputBytes/1048576).toFixed(1)} MB`);
      else toast('This PDF did not get smaller with this preset. Try Compact, or keep the original.');
    }
    else if(pendingTask==='Split'){if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');const range=$('#page-range').value.trim(),pages=range?range:[...selectedSplitPages].sort((a,b)=>a-b);toast(await DocumentEngine.splitPdf(selectedTaskFiles[0],pages))}
    else if(pendingTask==='Organize'){if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');toast(await DocumentEngine.organizePdf(selectedTaskFiles[0],organizeOrder))}
    else if(pendingTask==='Convert'){
      if(!selectedTaskFiles.length)throw new Error('Choose a file first.');
      if(['docx-pdf','docx-png','docx-jpg'].includes(selectedConversion)){
        if(selectedTaskFiles.length!==1||!docxPreviewReady)throw new Error('Choose one Word file and wait for its page preview.');
        const host=$('#docx-conversion-preview .docx-preview-host'),status=$('#docx-conversion-preview .document-preview-heading span');
        if(!host)throw new Error('The Word page preview is unavailable. Choose the file again.');
        if(selectedConversion==='docx-pdf')toast(await DocumentEngine.docxToPdf(selectedTaskFiles[0],host,(done,total)=>{if(status)status.textContent=`Creating PDF · page ${done} of ${total}`}));
        else toast(await DocumentEngine.docxToImages(selectedTaskFiles[0],host,selectedConversion==='docx-png'?'png':'jpg',(done,total)=>{if(status)status.textContent=`Rendering image ${done} of ${total}`}));
        if(status)status.textContent=`${host.querySelectorAll('section.docx').length} pages · review before export`;
      }
      else if(selectedConversion==='docx-text')toast(await DocumentEngine.docxToText(selectedTaskFiles));
      else if(selectedConversion==='pptx-text')toast(await DocumentEngine.pptxToText(selectedTaskFiles));
      else if(selectedConversion==='xlsx-csv')toast(await DocumentEngine.xlsxToCsv(selectedTaskFiles));
      else if(selectedConversion==='pdf-images')toast(await DocumentEngine.pdfsToImages(selectedTaskFiles,'png'));
      else if(selectedConversion==='pdf-jpg')toast(await DocumentEngine.pdfsToImages(selectedTaskFiles,'jpg'));
      else if(selectedConversion==='pdf-text')toast(await DocumentEngine.pdfsToText(selectedTaskFiles));
      else if(selectedConversion==='pdf-docx')toast(await DocumentEngine.pdfsToDocx(selectedTaskFiles));
      else if(selectedConversion==='images-pdf')toast(await DocumentEngine.imagesToPdf(selectedTaskFiles));
      else if(selectedConversion==='text-pdf')toast(await DocumentEngine.textToPdf(selectedTaskFiles));
      else throw new Error('Choose one of the available conversion cards.');
    } else if(pendingTask==='Translate'){
      if(!translatedDocument){button.disabled=false;await translateCurrentLines();return}
      DocumentEngine.download(translatedDocument.blob,translatedDocument.filename);toast(translatedDocument.overflowLines?`Translated PDF downloaded. Review ${translatedDocument.overflowLines} text area${translatedDocument.overflowLines===1?'':'s'} for fit.`:'Translated PDF downloaded.');
    } else if(pendingTask==='Edit'){
      if(!selectedTaskFiles[0])throw new Error('Choose a PDF or Word document first.');
      if(selectedTaskFiles[0].name.toLowerCase().endsWith('.docx')){
        if(!docxEditReady||!docxEditHost)throw new Error('Wait for the Word page editor to finish rendering.');
        const status=$('#line-editor .document-preview-heading span'),result=await DocumentEngine.exportDocxEditedPdf(selectedTaskFiles[0],docxEditHost,(done,total)=>{if(status)status.textContent=`Creating edited PDF · page ${done} of ${total}`});
        DocumentEngine.download(result.blob,result.filename);
        toast(result.overflowBlocks?`Edited PDF downloaded · ${result.overflowBlocks} paragraph${result.overflowBlocks===1?' still':'s still'} overflow the original box.`:'Edited Word PDF downloaded. Page appearance is preserved as images; text is not searchable.');
        if(status)status.textContent=`${docxEditHost.querySelectorAll('section.docx').length} pages · ${docxEditHost.querySelectorAll('.docx-editing-block').length} editable paragraphs`;
      }else{
        if(!taskPages.length)throw new Error('Choose a text-based PDF first.');readEditedLines();
        const longLines=await DocumentEngine.exportPositionedPdf(selectedTaskFiles[0],taskPages);toast(longLines?`PDF downloaded. Review ${longLines} long line${longLines===1?'':'s'} for fit.`:'Edited PDF downloaded.');
      }
    }
  }catch(error){toast(error.message||'Could not complete this operation.')}finally{button.innerHTML=pendingTask==='Translate'&&translatedDocument?'Download translated PDF <span>↗</span>':label;updateTaskCta()}
}
function closeTool(){previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];setView(previousView||'documents')}
async function addFiles(fileList,kind){const incoming=[...fileList];if(!incoming.length)return;let saved=0;for(const file of incoming){const ext=(file.name.split('.').pop()||'file').toLowerCase();let record;try{record=await WorkspaceStore.save(file);workspaceFileIds.set(file,record.id);saved++}catch(error){toast(`${file.name} is available until this tab closes; local storage could not save it.`)}files.unshift({id:record?.id,name:file.name,ext:ext.toUpperCase().slice(0,5),size:file.size>1048576?`${(file.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(file.size/1024))} KB`,date:'Just now',kind:kind||(['mp4','mov','webm'].includes(ext)?'video':'document'),people:['KP'],tone:iconTypes[ext]||'docx',file});}renderFiles();toast(`${incoming.length} ${incoming.length===1?'file':'files'} added${saved?` · ${saved} saved on this device`:''}`);}
window.TransformoWorkspaceFiles={add:addFiles,idFor:file=>workspaceFileIds.get(file)};
async function restoreWorkspaceFiles(){try{const records=await WorkspaceStore.list();const restored=records.map(record=>{workspaceFileIds.set(record.file,record.id);const ext=(record.name.split('.').pop()||'file').toLowerCase();return{id:record.id,name:record.name,ext:ext.toUpperCase().slice(0,5),size:record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`,date:'Saved locally',kind:record.type.startsWith('video/')?'video':'document',people:['KP'],tone:iconTypes[ext]||'docx',file:record.file}});files=[...restored,...files.filter(file=>!file.id||!restored.some(record=>record.id===file.id))];renderFiles()}catch{}}
function showSearch(){const el=$('#search-overlay');el.hidden=false;setTimeout(()=>$('#search-input').focus(),25);renderSearch('')}
function renderSearch(q){const terms=[...new Set([...files.map(f=>f.name), 'Translate a document','Edit document','Organize pages','Convert format','PDF to images','PDF to JPG','PDF to text','PDF to Word','DOCX to PDF','DOCX to PNG','DOCX to JPG','DOCX to text','PPTX to text','XLSX to CSV','Images to PDF','Text to PDF','Merge PDFs','Split pages','Compress PDF','Add a watermark','Add page numbers','Video studio'])];const results=terms.filter(x=>!q||x.toLowerCase().includes(q.toLowerCase())).slice(0,8);$('#search-results').innerHTML=results.map(x=>`<button class="search-result" data-search="${esc(x)}">${esc(x)}<small>${x.includes('.')?'File':'Tool'}</small></button>`).join('')}
$('#file-list').addEventListener('click',async e=>{const open=e.target.closest('[data-open-file-id]');if(open){const record=await WorkspaceStore.get(open.dataset.openFileId);if(!record){toast('That local file is no longer available.');return}if(record.type.startsWith('video/')){TransformoVideoEditor.open(record.file);return}const name=record.name.toLowerCase(),task=name.endsWith('.pdf')||name.endsWith('.docx')?'Edit':'Convert';openTask(task);selectedTaskFiles=[record.file];await analyzeTaskFiles();updateTaskCta();return}const button=e.target.closest('.row-menu');if(button){if(!button.dataset.fileId){toast(`${button.dataset.file} is a sample item. Upload a file to work with it.`);return}if(confirm(`Remove “${button.dataset.file}” from this device?`)){const projectRefs=await WorkspaceStore.listVideoProjects(),dependent=projectRefs.filter(project=>Array.isArray(project.clips)&&project.clips.some(clip=>clip.fileId===button.dataset.fileId));if(dependent.length){toast(`This source clip is used by ${dependent.length} saved video project${dependent.length===1?'':'s'}. Delete those projects first.`);return}await WorkspaceStore.remove(button.dataset.fileId);files=files.filter(file=>file.id!==button.dataset.fileId);renderFiles();toast('Removed from this device.')}}});
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-task]').forEach(b=>b.addEventListener('click',()=>openTask(b.dataset.task,b.dataset.conversionDefault||'')));
$$('.filter-tab[data-filter]').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;renderFiles()}));
$('#upload-button').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('#video-upload').addEventListener('click',()=>$('#video-input').click());$('#video-input').addEventListener('change',async e=>{const selected=[...e.target.files];await addFiles(selected,'video');setView('videos');if(selected.length)TransformoVideoEditor.open(selected);e.target.value=''});
$('#video-projects').addEventListener('click',e=>{const button=e.target.closest('[data-open-video-index]');if(!button)return;const file=files.filter(item=>item.kind==='video')[Number(button.dataset.openVideoIndex)];if(file)TransformoVideoEditor.open(file.file)});
$('#saved-video-projects').addEventListener('click',async e=>{const remove=e.target.closest('[data-remove-video-project-id]');if(remove){const project=await WorkspaceStore.getVideoProject(remove.dataset.removeVideoProjectId);if(project&&project.id===TransformoVideoEditor.currentProjectId()){toast('Close the current edit before deleting its saved project.');return}if(project&&confirm(`Delete the saved edit “${project.name}”? Source clips stay in your workspace.`)){await WorkspaceStore.removeVideoProject(project.id);renderSavedVideoProjects();toast('Saved video project deleted.')}return}const open=e.target.closest('[data-open-video-project-id]');if(!open)return;setView('videos');open.disabled=true;try{await TransformoVideoEditor.openProject(open.dataset.openVideoProjectId)}catch(error){toast(error.message||'Could not open the saved video project.')}finally{open.disabled=false}});
window.addEventListener('transformo:video-project-saved',renderSavedVideoProjects);
const fileDropOverlay=$('#file-drop-overlay');
let fileDropExitTimer;
function isFileDrag(event){const transfer=event.dataTransfer;if(!transfer)return false;const types=Array.from(transfer.types||[]),items=Array.from(transfer.items||[]);return transfer.files?.length>0||types.some(type=>String(type).toLowerCase()==='files')||items.some(item=>item.kind==='file')}
function showFileDrop(event){if(!isFileDrag(event))return;event.preventDefault();clearTimeout(fileDropExitTimer);const videoPage=$('#videos-view').classList.contains('visible')||($('#tool-view').classList.contains('visible')&&previousView==='videos');$('#file-drop-title').textContent=videoPage?'Drop clips or subtitles here':'Drop files here';$('#file-drop-description').textContent=videoPage?'Add clips or import an SRT subtitle track.':'Release to add them to your local workspace.';fileDropOverlay.hidden=false}
document.addEventListener('dragenter',showFileDrop,true);document.addEventListener('dragover',showFileDrop,true);
function hideFileDrop(){clearTimeout(fileDropExitTimer);fileDropOverlay.hidden=true}
document.addEventListener('dragleave',event=>{if(isFileDrag(event)){clearTimeout(fileDropExitTimer);fileDropExitTimer=setTimeout(hideFileDrop,120)}},true);
document.addEventListener('dragend',hideFileDrop,true);window.addEventListener('blur',()=>hideFileDrop());
document.addEventListener('drop',async event=>{
  if(!isFileDrag(event))return;
  event.preventDefault();hideFileDrop();
  const incoming=[...event.dataTransfer.files];
  if($('#videos-view').classList.contains('visible')||($('#tool-view').classList.contains('visible')&&previousView==='videos')){
    const clips=incoming.filter(file=>file.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(file.name));
    const subtitleFiles=incoming.filter(file=>/\.srt$/i.test(file.name)),activeEditor=TransformoVideoEditor.hasWorkspace();
    if(!clips.length&&!subtitleFiles.length){toast('Drop video clips or an SRT subtitle file here.');return}
    if(clips.length){await addFiles(clips,'video');setView('videos');if(activeEditor)await TransformoVideoEditor.addClips(clips);else TransformoVideoEditor.open(clips)}
    if(subtitleFiles.length){if(!TransformoVideoEditor.hasWorkspace()){toast('Open a video clip before importing its SRT subtitle track.');return}await TransformoVideoEditor.importSubtitles(subtitleFiles[0]);if(subtitleFiles.length>1)toast('Imported the first SRT file. Import additional tracks one at a time.')}
    return;
  }
  if($('#tool-view').classList.contains('visible')){
    const ext=file=>file.name.split('.').pop().toLowerCase();
    const isPdf=file=>ext(file)==='pdf',isDocx=file=>ext(file)==='docx';
    const accepts=file=>['Translate','Edit'].includes(pendingTask)?isPdf(file)||isDocx(file):['Organize','Split','Merge','Compress','Watermark','Number'].includes(pendingTask)?isPdf(file):pendingTask==='Convert'?['pdf','docx','pptx','xlsx','txt','png','jpg','jpeg','webp','gif','bmp'].includes(ext(file))||file.type.startsWith('image/'):true;
    let valid=incoming.filter(accepts);
    if(!valid.length){toast(['Translate','Edit'].includes(pendingTask)?'Drop a PDF or Word DOCX file here.':'Drop a supported file here.');return}
    if(['Translate','Edit','Organize','Split','Compress','Watermark','Number'].includes(pendingTask)&&valid.length>1){toast('This tool works with one file at a time. The first supported file was loaded.');valid=valid.slice(0,1)}
    discardTranslationResult();selectedTaskFiles=valid;
    if(pendingTask==='Translate'){docxTranslationToken++;docxTranslationReady=false;docxTranslationHost=null}
    if(pendingTask==='Edit'){docxEditToken++;docxEditReady=false;docxEditHost=null}
    updateTaskCta();syncDocxConversionPreview();await addFiles(valid);await analyzeTaskFiles();updateTaskCta();return;
  }
  await addFiles(incoming);
},true);
$('#tool-back').addEventListener('click',closeTool);$('#tool-cta').addEventListener('click',performCurrentTask);
$('#tool-content').addEventListener('click',event=>{
  const mode=event.target.closest('[data-translation-mode]');
  if(mode){const field=$('#translation-mode');field.value=mode.dataset.translationMode;$$('[data-translation-mode]').forEach(button=>{const selected=button===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});const consent=$('#translation-consent'),label=consent?.closest('.translation-consent');if(field.value==='local'&&consent)consent.checked=false;if(label)label.hidden=field.value==='local';discardTranslationResult();updateTaskCta();refreshTranslationAvailability();return}
  const swap=event.target.closest('[data-language-swap]');
  if(swap){const source=$('#source-language'),target=$('#target-language'),nextSource=target.value;target.value=source.value;source.value=nextSource;$$('[data-language-target="source-language"],[data-language-target="target-language"]').forEach(button=>{const field=document.getElementById(button.dataset.languageTarget),selected=button.dataset.languageValue===field.value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});discardTranslationResult();updateTaskCta();refreshTranslationAvailability();return}
  const more=event.target.closest('[data-language-more]');
  if(more){const expanded=more.getAttribute('aria-expanded')!=='true',grid=more.closest('.language-option-grid');grid.classList.toggle('expanded',expanded);more.setAttribute('aria-expanded',String(expanded));more.textContent=expanded?'Fewer languages':'More languages';return}
  const language=event.target.closest('[data-language-target]');
  if(language){const field=document.getElementById(language.dataset.languageTarget);if(!field)return;field.value=language.dataset.languageValue;language.closest('.language-option-grid').querySelectorAll('[data-language-target]').forEach(button=>{const selected=button===language;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});if(['source-language','target-language'].includes(field.id)){discardTranslationResult();refreshTranslationAvailability()}updateTaskCta();return}
  const conversion=event.target.closest('[data-conversion-option]');
  if(conversion){selectedConversion=conversion.dataset.conversionOption;syncDocxConversionPreview();updateTaskCta();return}
  const compression=event.target.closest('[data-compression-option]');
  if(compression){selectedCompression=compression.dataset.compressionOption;$('#tool-content').querySelectorAll('[data-compression-option]').forEach(button=>{const selected=button===compression;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});updateTaskCta();return}
  const file=event.target.closest('[data-workspace-file-id]');
  if(file){const id=file.dataset.workspaceFileId,multiple=['Merge','Convert'].includes(pendingTask);if(multiple){if(workspaceSelectionIds.has(id))workspaceSelectionIds.delete(id);else workspaceSelectionIds.add(id)}else if(workspaceSelectionIds.has(id))workspaceSelectionIds.clear();else{workspaceSelectionIds.clear();workspaceSelectionIds.add(id)}$('#workspace-file-options').querySelectorAll('[data-workspace-file-id]').forEach(button=>button.setAttribute('aria-pressed',String(workspaceSelectionIds.has(button.dataset.workspaceFileId))));$('#workspace-selection-count').textContent=`${workspaceSelectionIds.size} selected`;$('#load-workspace-files').disabled=!workspaceSelectionIds.size}
});
$('#tool-content').addEventListener('change',event=>{if(event.target.id==='translation-consent'){discardTranslationResult();updateTaskCta();refreshTranslationAvailability()}});
$('#search-trigger').addEventListener('click',showSearch);$('#search-input').addEventListener('input',e=>renderSearch(e.target.value));$('#search-overlay').addEventListener('click',e=>{if(e.target===$('#search-overlay'))$('#search-overlay').hidden=true});$('#search-results').addEventListener('click',e=>{const b=e.target.closest('[data-search]');if(!b)return;const value=b.dataset.search,task=value.split(' ')[0],presets={'PDF to images':'pdf-images','PDF to JPG':'pdf-jpg','PDF to text':'pdf-text','PDF to Word':'pdf-docx','DOCX to PDF':'docx-pdf','DOCX to PNG':'docx-png','DOCX to JPG':'docx-jpg','DOCX to text':'docx-text','PPTX to text':'pptx-text','XLSX to CSV':'xlsx-csv','Images to PDF':'images-pdf','Text to PDF':'text-pdf'};if(presets[value]){$('#search-overlay').hidden=true;openTask('Convert',presets[value])}else if(['Translate','Edit','Organize','Convert','Merge','Split','Compress'].includes(task)){ $('#search-overlay').hidden=true;openTask(task)}else if(value==='Add a watermark'){$('#search-overlay').hidden=true;openTask('Watermark')}else if(value==='Add page numbers'){$('#search-overlay').hidden=true;openTask('Number')}else if(task==='Video'){$('#search-overlay').hidden=true;setView('videos')}else{$('#search-overlay').hidden=true;toast(`Opening ${value}`)}});
$$('[data-go-documents]').forEach(b=>b.addEventListener('click',()=>setView('documents')));
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch()}
  if(e.key==='Escape'){if($('#tool-view').classList.contains('visible'))closeTool();$('#search-overlay').hidden=true}
  if(e.key.toLowerCase()==='u'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!e.metaKey&&!e.ctrlKey)($('#videos-view').classList.contains('visible')?$('#video-input'):$('#file-input')).click();
});
renderFiles();restoreWorkspaceFiles();renderSavedVideoProjects();
