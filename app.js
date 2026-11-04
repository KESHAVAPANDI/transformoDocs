const iconTypes={pdf:'pdf',docx:'docx',doc:'docx',xlsx:'xlsx',xls:'xlsx',pptx:'pptx',ppt:'pptx',mp4:'mp4',mov:'mp4',webm:'mp4'};
let files=[];
let activeFilter='all', pendingTask='Translate', toastTimer, taskPages=[], selectedTaskFiles=[], previewUrls=[], translationPreviews={source:null,translated:null}, translatedDocument=null, previousView='documents', organizeOrder=[], organizePreviewPages=[], selectedSplitPages=new Set(), splitPreviewPages=[], workspaceSelectionIds=new Set(), selectedConversion='';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function conversionType(files=selectedTaskFiles){if(!files.length)return'';const types=files.map(file=>{const ext=file.name.split('.').pop().toLowerCase();return ext==='pdf'?'pdf':ext==='txt'?'text':file.type.startsWith('image/')||/^(png|jpe?g|webp|gif|bmp)$/.test(ext)?'image':'other'});return types.every(type=>type===types[0])?types[0]:'mixed'}
function updateConversionChoices(){const root=$('#conversion-options'),help=$('#conversion-help');if(!root)return;const type=conversionType(),choices=type==='pdf'?[['pdf-images','PDF → PNG images','Export every page into a ZIP.'],['pdf-jpg','PDF → JPG images','Export smaller, shareable page images.'],['pdf-text','PDF → text','Extract readable text into a .txt file.']]:type==='image'?[['images-pdf','Images → PDF','Combine selected images into one PDF.']]:type==='text'?[['text-pdf','Text → PDF','Create a paginated PDF from text files.']]:[];if(type&&!choices.some(([id])=>id===selectedConversion))selectedConversion='';root.innerHTML=choices.length?choices.map(([id,title,detail])=>`<button type="button" class="conversion-option-card ${selectedConversion===id?'selected':''}" data-conversion-option="${id}" aria-pressed="${selectedConversion===id}"><span class="conversion-option-icon">${id==='pdf-text'?'T':id==='pdf-images'?'▧':id==='pdf-jpg'?'◉':id==='images-pdf'?'▤':'¶'}</span><span><strong>${title}</strong><small>${detail}</small></span><span class="conversion-option-check">✓</span></button>`).join(''):'<div class="conversion-empty">Choose files of one type to see available conversions.</div>';if(help)help.textContent=type==='mixed'?'Choose PDFs, images, or text files in separate batches.':type==='other'?'This file type does not have a conversion available yet.':'Choose an output card to continue.'}
function updateTaskCta(){const button=$('#tool-cta');if(!button)return;if(pendingTask==='Split'){const range=$('#page-range')?.value.trim(),count=selectedSplitPages.size;button.innerHTML=range?'Extract page range <span>↗</span>':count?`Extract ${count} page${count===1?'':'s'} <span>↗</span>`:'Extract pages <span>↗</span>';button.disabled=!selectedTaskFiles.length||(!range&&!count);return}if(pendingTask==='Convert'){updateConversionChoices();const labels={'pdf-images':'Export PNG pages','pdf-jpg':'Export JPG pages','pdf-text':'Extract PDF text','images-pdf':'Create PDF from images','text-pdf':'Create PDF from text'};button.innerHTML=`${labels[selectedConversion]||'Choose a conversion'} <span>↗</span>`;button.disabled=!selectedTaskFiles.length||conversionType()==='mixed'||conversionType()==='other'||!selectedConversion;return}if(pendingTask==='Translate'){const source=$('#source-language')?.value,target=$('#target-language')?.value,same=source&&source===target;button.innerHTML=same?'Choose different languages <span>↗</span>':translatedDocument?'Download translated PDF <span>↗</span>':'Translate document <span>↗</span>';button.disabled=same||(!selectedTaskFiles.length&&!translatedDocument);return}if(pendingTask==='Merge'){button.innerHTML=selectedTaskFiles.length>=2?`Merge ${selectedTaskFiles.length} PDFs <span>↗</span>`:'Choose at least 2 PDFs <span>↗</span>';button.disabled=selectedTaskFiles.length<2;return}if(pendingTask==='Watermark'){button.disabled=!selectedTaskFiles.length||!$('#watermark-text')?.value.trim();return}button.disabled=!selectedTaskFiles.length}
function renderFiles(){const list=$('#file-list'),shown=files.filter(f=>activeFilter==='all'||f.kind===activeFilter);$('#empty-state').hidden=shown.length>0;list.innerHTML=shown.map((f,i)=>`<div class="file-row" style="animation-delay:${i*45}ms"><div class="file-name"><span class="file-type-icon ${f.tone}">${esc(f.ext)}</span><span class="file-title-wrap">${f.id?`<button class="file-title file-open" data-open-file-id="${esc(f.id)}">${esc(f.name)}</button>`:`<div class="file-title">${esc(f.name)}</div>`}<div class="file-meta">${f.kind==='video'?'Video':'Saved on this device'}</div></span></div><span class="file-date">${esc(f.date)}</span><span class="file-size">${esc(f.size)}</span><button class="row-menu" aria-label="File actions" data-file-id="${esc(f.id||'')}" data-file="${esc(f.name)}">···</button></div>`).join('');renderVideoProjects();}
function renderVideoProjects(){const root=$('#video-projects');if(!root)return;const clips=files.filter(file=>file.kind==='video');root.innerHTML=clips.length?clips.map((file,index)=>`<article class="video-project-card"><div class="project-thumb ${index%3===1?'thumb-two':index%3===2?'thumb-three':''}"><button class="project-play" type="button" data-open-video-index="${index}" aria-label="Open ${esc(file.name)}">▶</button></div><div class="project-meta"><span class="project-name">${esc(file.name)}</span><span class="project-duration">${esc(file.size)}</span></div><div class="project-updated">Saved on this device</div></article>`).join(''):'<div class="video-empty-state"><span>▷</span><strong>Your video space is ready.</strong><small>Add a clip to start an edit. It will stay on this device.</small></div>';}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function setView(view){$$('.page-view').forEach(v=>v.classList.toggle('visible',v.id===`${view}-view`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===(view==='tool'?'documents':view)));$('#crumb-current').textContent=view==='videos'?'Video studio':view==='tool'?$('#tool-title').textContent:'Documents';window.scrollTo({top:0,behavior:'smooth'});}
function openTask(task,conversionPreset=''){
  previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];translationPreviews={source:null,translated:null};translatedDocument=null;organizeOrder=[];organizePreviewPages=[];selectedSplitPages=new Set();splitPreviewPages=[];workspaceSelectionIds=new Set();selectedConversion='';
  if($('.page-view.visible')?.id!=='tool-view')previousView=$('.page-view.visible')?.id.replace('-view','')||'documents';
  pendingTask=task;selectedConversion=conversionPreset;taskPages=[];selectedTaskFiles=[];
  const configs={Translate:['Translate a document','Translate the full document and review the translated pages before export.'],Edit:['Edit document text','Change text directly over the page while keeping its original position.'],Organize:['Organize PDF pages','Reorder, rotate, and remove pages while keeping the document in view.'],Convert:['Convert files','Pick a conversion card for PDFs, images, or text.'],Merge:['Merge PDFs','Arrange your files, then combine them in that order.'],Split:['Split a PDF','Extract selected pages into a new PDF.'],Watermark:['Add a PDF watermark','Stamp a light, centered watermark across every page.'],Number:['Add page numbers','Add a clean page number to the bottom of every page.']};
  const [title,desc]=configs[task]||configs.Translate; $('#tool-title').textContent=title; $('#tool-description').textContent=desc;
  const accepts=['Translate','Edit','Organize','Merge','Split','Watermark','Number'].includes(task)?'application/pdf,.pdf':'.pdf,.txt,image/*';
  const multiple=task==='Merge'||task==='Convert'?'multiple':'';
  let fields=`<div class="tool-field"><label for="task-files">${task==='Merge'?'Choose two or more PDFs':task==='Convert'?'Choose PDF, text, or image files':'Choose a PDF file'}</label><input id="task-files" type="file" accept="${accepts}" ${multiple} /><span class="field-help">Files stay on this device. Nothing is uploaded.</span></div><div class="workspace-file-picker" id="workspace-file-picker" hidden><label>Or choose from this workspace</label><div class="workspace-file-options" id="workspace-file-options"></div><div class="workspace-picker-footer"><span id="workspace-selection-count">0 selected</span><button class="secondary-button" id="load-workspace-files" type="button" disabled>Use selected files</button></div></div>`;
  if(task==='Split') fields+=`<div class="tool-field"><label for="page-range">Or enter page numbers</label><input id="page-range" placeholder="e.g. 1–4, 7, 10–12" /><span class="field-help">Page numbers start at 1. You can also select pages from the preview below.</span></div>`;
  if(task==='Organize') fields+=`<div class="position-note">✧ <span>Move pages with the arrows, rotate a page in 90° steps, or remove pages. The source file is never changed.</span></div>`;
  if(task==='Watermark') fields+=`<div class="tool-field"><label for="watermark-text">Watermark text</label><input id="watermark-text" maxlength="48" placeholder="CONFIDENTIAL" /><span class="field-help">A subtle diagonal stamp is added to each page. Your source PDF stays untouched.</span></div>`;
  if(task==='Number') fields+=`<div class="position-note">✧ <span>Page numbers are placed at the bottom center with consistent spacing across the document.</span></div>`;
  if(task==='Convert') fields+=`<div class="conversion-choice-field"><div class="conversion-choice-label">Choose an output</div><div class="conversion-options" id="conversion-options"></div><span class="field-help" id="conversion-help">Choose files to see the conversions available.</span></div>`;
  if(task==='Translate') fields+=`<input type="hidden" id="source-language" value="en" /><input type="hidden" id="target-language" value="ja" /><div class="language-pair"><div class="tool-field"><label>Translate from</label><div class="language-option-grid" role="group" aria-label="Translate from"><button type="button" class="language-option selected" data-language-target="source-language" data-language-value="en" aria-pressed="true">English</button><button type="button" class="language-option" data-language-target="source-language" data-language-value="ja" aria-pressed="false">日本語</button><button type="button" class="language-option" data-language-target="source-language" data-language-value="es" aria-pressed="false">Español</button><button type="button" class="language-option" data-language-target="source-language" data-language-value="fr" aria-pressed="false">Français</button><button type="button" class="language-option" data-language-target="source-language" data-language-value="hi" aria-pressed="false">हिन्दी</button><button type="button" class="language-option" data-language-target="source-language" data-language-value="ta" aria-pressed="false">தமிழ்</button></div></div><div class="language-arrow">→</div><div class="tool-field"><label>Translate to</label><div class="language-option-grid" role="group" aria-label="Translate to"><button type="button" class="language-option" data-language-target="target-language" data-language-value="en" aria-pressed="false">English</button><button type="button" class="language-option selected" data-language-target="target-language" data-language-value="ja" aria-pressed="true">日本語</button><button type="button" class="language-option" data-language-target="target-language" data-language-value="es" aria-pressed="false">Español</button><button type="button" class="language-option" data-language-target="target-language" data-language-value="fr" aria-pressed="false">Français</button><button type="button" class="language-option" data-language-target="target-language" data-language-value="hi" aria-pressed="false">हिन्दी</button><button type="button" class="language-option" data-language-target="target-language" data-language-value="ta" aria-pressed="false">தமிழ்</button></div></div></div><div class="position-note">✧ <span>Translate related lines together, then compare the full pages before downloading.</span></div>`;
  if(task==='Edit') fields+=`<div class="position-note">✧ <span>Changing text keeps its original anchor. The edited PDF is image-backed to preserve visual fidelity.</span></div>`;
  if(task==='Merge') fields+=`<div id="merge-order" class="merge-order" hidden></div>`;
  if(task==='Edit'||task==='Translate'||task==='Organize'||task==='Split') fields+=`<div id="line-editor" class="line-editor" hidden></div>`;
  $('#tool-content').innerHTML=fields;
  $('#tool-cta').innerHTML=task==='Merge'?'Merge PDFs <span>↗</span>':task==='Split'?'Extract pages <span>↗</span>':task==='Organize'?'Save organized PDF <span>↗</span>':task==='Translate'?'Translate document <span>↗</span>':task==='Edit'?'Export edited PDF <span>↗</span>':task==='Watermark'?'Add watermark <span>↗</span>':task==='Number'?'Add page numbers <span>↗</span>':'Convert and download <span>↗</span>';
  $('#tool-cta').disabled=true;
  $('#task-files').addEventListener('change',loadTaskFiles);
  $('#page-range')?.addEventListener('input',()=>{if($('#page-range').value.trim()){selectedSplitPages.clear();$$('[data-split-page]').forEach(card=>card.setAttribute('aria-pressed','false'));const count=$('#split-selection-count');if(count)count.textContent='0 selected'}updateTaskCta()});
  $('#watermark-text')?.addEventListener('input',updateTaskCta);
  $('#load-workspace-files').addEventListener('click',loadWorkspaceSelection);
  populateWorkspacePicker(task);
  setView('tool');
}
async function loadTaskFiles(event){
  discardTranslationResult();
  selectedTaskFiles=[...event.target.files];
  updateTaskCta();
  await addFiles(selectedTaskFiles);
  await analyzeTaskFiles();
  updateTaskCta();
}
async function populateWorkspacePicker(task){
  const picker=$('#workspace-file-picker'),root=$('#workspace-file-options');if(!picker||!root)return;
  try{
    const records=await WorkspaceStore.list(),isPdfOnly=['Edit','Translate','Organize','Split','Merge','Watermark','Number'].includes(task);
    const eligible=records.filter(record=>{const name=record.name.toLowerCase(),isPdf=name.endsWith('.pdf'),isVideo=record.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/.test(name);return isPdfOnly?isPdf:task==='Convert'?!isVideo:true});
    root.innerHTML=eligible.map(record=>`<button type="button" class="workspace-file-option" data-workspace-file-id="${esc(record.id)}" aria-pressed="false"><span class="workspace-option-icon ${iconTypes[(record.name.split('.').pop()||'').toLowerCase()]||'docx'}">${esc((record.name.split('.').pop()||'FILE').toUpperCase().slice(0,4))}</span><span class="workspace-option-copy"><strong>${esc(record.name)}</strong><small>${record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`}</small></span><span class="workspace-option-check">✓</span></button>`).join('');
    picker.hidden=!eligible.length;
  }catch{picker.hidden=true}
}
async function loadWorkspaceSelection(){
  const ids=[...workspaceSelectionIds];
  if(!ids.length){toast('Choose a saved file first.');return}
  try{discardTranslationResult();const records=await Promise.all(ids.map(id=>WorkspaceStore.get(id)));selectedTaskFiles=records.filter(Boolean).map(record=>record.file);updateTaskCta();await analyzeTaskFiles();updateTaskCta();toast(`${selectedTaskFiles.length} saved file${selectedTaskFiles.length===1?'':'s'} loaded.`)}catch(error){toast(error.message)}
}
async function analyzeTaskFiles(){
  if(!selectedTaskFiles.length)return;
  if((pendingTask==='Edit'||pendingTask==='Translate')&&selectedTaskFiles.length===1){
    try{taskPages=await DocumentEngine.inspectPdf(selectedTaskFiles[0]);if(pendingTask==='Translate')await renderTranslationPreview(selectedTaskFiles[0]);else await renderVisualPdfEditor(selectedTaskFiles[0]);toast(`Document ready · ${taskPages.length} page${taskPages.length===1?'':'s'}.`)}catch(error){toast(error.message)}
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
function ocrPanel(){return '<div class="position-note">Some pages are scans. Read them with OCR to make the text editable and translatable.</div><input type="hidden" id="ocr-language" value="eng" /><div class="ocr-controls"><div class="language-option-grid ocr-language-options" role="group" aria-label="OCR language"><button type="button" class="language-option selected" data-language-target="ocr-language" data-language-value="eng" aria-pressed="true">English</button><button type="button" class="language-option" data-language-target="ocr-language" data-language-value="hin" aria-pressed="false">हिन्दी</button><button type="button" class="language-option" data-language-target="ocr-language" data-language-value="tam" aria-pressed="false">தமிழ்</button><button type="button" class="language-option" data-language-target="ocr-language" data-language-value="jpn" aria-pressed="false">日本語</button><button type="button" class="language-option" data-language-target="ocr-language" data-language-value="spa" aria-pressed="false">Español</button><button type="button" class="language-option" data-language-target="ocr-language" data-language-value="fra" aria-pressed="false">Français</button></div><button class="secondary-button" id="run-ocr" type="button">Read scanned pages</button><span id="ocr-progress" class="field-help"></span></div>'}
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
  root.innerHTML=`<div class="document-preview-heading"><div><strong>Edit directly on the page</strong><span>Click a text area to change it. Your edits stay anchored to the same page position.</span></div></div>${needsOcr?ocrPanel():''}<div class="edit-document-grid">${pages}</div>${preview.total>preview.pages.length?`<div class="preview-limit-note">Editing preview shows ${preview.pages.length} of ${preview.total} pages. The remaining pages will stay unchanged in the export.</div>`:''}`;
  if(needsOcr)root.querySelector('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);
}
function drawTranslationPreview(mode){
  const root=$('#translation-page-view'),preview=translationPreviews[mode];if(!root||!preview)return;
  root.innerHTML=preview.pages.map(page=>`<figure class="document-page-card"><img src="${page.url}" alt="${mode==='source'?'Original':'Translated'} document page ${page.number}" loading="lazy" /><figcaption><span>PAGE ${String(page.number).padStart(2,'0')}</span><span>${mode==='source'?'Original':'Translated'}</span></figcaption></figure>`).join('')+(preview.total>preview.pages.length?`<div class="preview-limit-note">Previewing the first ${preview.pages.length} of ${preview.total} pages. The full document is included in translation.</div>`:'');
  $$('.document-preview-tab').forEach(button=>button.classList.toggle('active',button.dataset.documentPreview===mode));
}
async function renderTranslationPreview(file){
  const root=$('#line-editor');if(!root)return;root.hidden=false;root.innerHTML='<div class="document-preview-loading"><span class="preview-spinner"></span><span>Preparing full-page document preview…</span></div>';
  const preview=await DocumentEngine.renderPdfPages(file);
  const mode=translatedDocument?'translated':'source',old=translationPreviews[mode];
  old?.pages.forEach(page=>{URL.revokeObjectURL(page.url);previewUrls=previewUrls.filter(url=>url!==page.url)});
  translationPreviews[mode]={total:preview.total,pages:preview.pages.map(page=>{const url=URL.createObjectURL(page.blob);previewUrls.push(url);return{number:page.number,url}})};
  const hasScannedPages=taskPages.some(page=>!page.lines.length),ocr=hasScannedPages?ocrPanel():'';
  const overflow=translatedDocument?.overflowLines?`<div class="position-note position-note-warning">${translatedDocument.overflowLines} translated text area${translatedDocument.overflowLines===1?' may':'s may'} overflow its original page region. Check the translated preview before downloading.</div>`:'';
  root.innerHTML=`<div class="document-preview-heading"><div><strong>${preview.total} page${preview.total===1?'':'s'} · full document</strong><span>Review the document as pages, not extracted text.</span></div><div class="document-preview-tabs"><button type="button" class="document-preview-tab active" data-document-preview="source">Original</button><button type="button" class="document-preview-tab" data-document-preview="translated" ${translatedDocument?'':'disabled'}>Translated</button></div></div>${ocr}${overflow}<div class="document-page-grid" id="translation-page-view"></div>`;
  root.querySelectorAll('[data-document-preview]').forEach(button=>button.addEventListener('click',()=>{if(translationPreviews[button.dataset.documentPreview])drawTranslationPreview(button.dataset.documentPreview)}));
  if(hasScannedPages)root.querySelector('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);
  drawTranslationPreview(translatedDocument?'translated':'source');
}
function discardTranslationResult(){
  if(pendingTask!=='Translate')return;
  translationPreviews.translated?.pages.forEach(page=>{URL.revokeObjectURL(page.url);previewUrls=previewUrls.filter(url=>url!==page.url)});
  translationPreviews.translated=null;translatedDocument=null;
  const tab=$('[data-document-preview="translated"]');if(tab)tab.disabled=true;
  if(translationPreviews.source)drawTranslationPreview('source');
  updateTaskCta();
}
async function runOcrOnCurrentPdf(){
  if(!selectedTaskFiles[0]){toast('Choose a PDF first.');return}
  const button=$('#run-ocr'),progress=$('#ocr-progress');button.disabled=true;button.textContent='Starting OCR…';
  try{taskPages=await DocumentEngine.ocrPdf(selectedTaskFiles[0],$('#ocr-language').value,message=>{if(message.status==='recognizing text')button.textContent=`Reading pages ${Math.round(message.progress*100)}%…`;else if(message.status)button.textContent=`${message.status}…`},taskPages);if(pendingTask==='Translate')await renderTranslationPreview(selectedTaskFiles[0]);else await renderVisualPdfEditor(selectedTaskFiles[0]);const total=taskPages.reduce((n,p)=>n+p.lines.length,0);toast(total?`OCR is ready · ${total} text lines found across the pages.`:'OCR could not find readable text in this file.');}
  catch(error){progress.textContent=error.message;toast(error.message)}finally{const retry=$('#run-ocr');if(retry){retry.disabled=false;retry.textContent='Run OCR on this PDF'}}
}
function readEditedLines(){let index=0;for(const page of taskPages)for(const line of page.lines){const input=$(`[data-line-index="${index++}"]`);if(input)line.edited=input.value}}
async function translateCurrentLines(){
  if(!taskPages.length||!selectedTaskFiles[0]){toast('Choose a PDF first.');return}
  if(!taskPages.some(page=>page.lines.length)){toast('Run OCR on the scanned pages before translating.');return}
  readEditedLines();const button=$('#tool-cta');button.disabled=true;
  try{
    await DocumentEngine.translateLines(taskPages,$('#source-language').value,$('#target-language').value,(done,total)=>{button.textContent=`Translating document · ${Math.round(done/Math.max(1,total)*100)}%`});
    button.textContent='Composing translated pages…';
    translatedDocument=await DocumentEngine.exportPositionedPdf(selectedTaskFiles[0],taskPages,()=>{},true,$('#target-language').value);
    await renderTranslationPreview(translatedDocument.blob);
    const tab=$('[data-document-preview="translated"]');if(tab){tab.disabled=false;tab.click()}
    button.innerHTML='Download translated PDF <span>↗</span>';
    toast(translatedDocument.overflowLines?`Translation ready · ${translatedDocument.overflowLines} text area${translatedDocument.overflowLines===1?' may':'s may'} overflow. Review the page preview.`:'Translated document ready · review the page preview before downloading.');
  }catch(error){toast(error.message||'The document could not be translated.')}finally{button.disabled=false;if(!translatedDocument)button.innerHTML='Translate document <span>↗</span>'}
}
async function performCurrentTask(){
  const button=$('#tool-cta');button.disabled=true;const label=button.textContent;button.textContent='Working…';
  try{
    if(pendingTask==='Merge') toast(await DocumentEngine.mergePdfs(selectedTaskFiles));
    else if(pendingTask==='Watermark') toast(await DocumentEngine.watermarkPdf(selectedTaskFiles[0],$('#watermark-text').value));
    else if(pendingTask==='Number') toast(await DocumentEngine.numberPdf(selectedTaskFiles[0]));
    else if(pendingTask==='Split'){if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');const range=$('#page-range').value.trim(),pages=range?range:[...selectedSplitPages].sort((a,b)=>a-b);toast(await DocumentEngine.splitPdf(selectedTaskFiles[0],pages))}
    else if(pendingTask==='Organize'){if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');toast(await DocumentEngine.organizePdf(selectedTaskFiles[0],organizeOrder))}
    else if(pendingTask==='Convert'){
      if(!selectedTaskFiles.length)throw new Error('Choose a file first.');
      if(selectedConversion==='pdf-images')toast(await DocumentEngine.pdfsToImages(selectedTaskFiles,'png'));
      else if(selectedConversion==='pdf-jpg')toast(await DocumentEngine.pdfsToImages(selectedTaskFiles,'jpg'));
      else if(selectedConversion==='pdf-text')toast(await DocumentEngine.pdfsToText(selectedTaskFiles));
      else if(selectedConversion==='images-pdf')toast(await DocumentEngine.imagesToPdf(selectedTaskFiles));
      else if(selectedConversion==='text-pdf')toast(await DocumentEngine.textToPdf(selectedTaskFiles));
      else throw new Error('Choose one of the available conversion cards.');
    } else if(pendingTask==='Translate'){
      if(!translatedDocument){button.disabled=false;await translateCurrentLines();return}
      DocumentEngine.download(translatedDocument.blob,translatedDocument.filename);toast(translatedDocument.overflowLines?`Translated PDF downloaded. Review ${translatedDocument.overflowLines} text area${translatedDocument.overflowLines===1?'':'s'} for fit.`:'Translated PDF downloaded.');
    } else if(pendingTask==='Edit'){
      if(!selectedTaskFiles[0]||!taskPages.length)throw new Error('Choose a text-based PDF first.');readEditedLines();
      const longLines=await DocumentEngine.exportPositionedPdf(selectedTaskFiles[0],taskPages);toast(longLines?`PDF downloaded. Review ${longLines} long line${longLines===1?'':'s'} for fit.`:'Edited PDF downloaded.');
    }
  }catch(error){toast(error.message||'Could not complete this operation.')}finally{button.innerHTML=pendingTask==='Translate'&&translatedDocument?'Download translated PDF <span>↗</span>':label;updateTaskCta()}
}
function closeTool(){previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];setView(previousView||'documents')}
async function addFiles(fileList,kind){const incoming=[...fileList];if(!incoming.length)return;let saved=0;for(const file of incoming){const ext=(file.name.split('.').pop()||'file').toLowerCase();let record;try{record=await WorkspaceStore.save(file);saved++}catch(error){toast(`${file.name} is available until this tab closes; local storage could not save it.`)}files.unshift({id:record?.id,name:file.name,ext:ext.toUpperCase().slice(0,5),size:file.size>1048576?`${(file.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(file.size/1024))} KB`,date:'Just now',kind:kind||(['mp4','mov','webm'].includes(ext)?'video':'document'),people:['KP'],tone:iconTypes[ext]||'docx',file});}renderFiles();toast(`${incoming.length} ${incoming.length===1?'file':'files'} added${saved?` · ${saved} saved on this device`:''}`);}
async function restoreWorkspaceFiles(){try{const records=await WorkspaceStore.list();const restored=records.map(record=>{const ext=(record.name.split('.').pop()||'file').toLowerCase();return{id:record.id,name:record.name,ext:ext.toUpperCase().slice(0,5),size:record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`,date:'Saved locally',kind:record.type.startsWith('video/')?'video':'document',people:['KP'],tone:iconTypes[ext]||'docx',file:record.file}});files=[...restored,...files.filter(file=>!file.id||!restored.some(record=>record.id===file.id))];renderFiles()}catch{}}
function showSearch(){const el=$('#search-overlay');el.hidden=false;setTimeout(()=>$('#search-input').focus(),25);renderSearch('')}
function renderSearch(q){const terms=[...new Set([...files.map(f=>f.name), 'Translate a document','Edit document','Organize pages','Convert format','PDF to images','PDF to JPG','PDF to text','Images to PDF','Text to PDF','Merge PDFs','Split pages','Add a watermark','Add page numbers','Video studio'])];const results=terms.filter(x=>!q||x.toLowerCase().includes(q.toLowerCase())).slice(0,8);$('#search-results').innerHTML=results.map(x=>`<button class="search-result" data-search="${esc(x)}">${esc(x)}<small>${x.includes('.')?'File':'Tool'}</small></button>`).join('')}
$('#file-list').addEventListener('click',async e=>{const open=e.target.closest('[data-open-file-id]');if(open){const record=await WorkspaceStore.get(open.dataset.openFileId);if(!record){toast('That local file is no longer available.');return}if(record.type.startsWith('video/')){TransformoVideoEditor.open(record.file);return}const task=record.name.toLowerCase().endsWith('.pdf')?'Edit':'Convert';openTask(task);selectedTaskFiles=[record.file];await analyzeTaskFiles();updateTaskCta();return}const button=e.target.closest('.row-menu');if(button){if(!button.dataset.fileId){toast(`${button.dataset.file} is a sample item. Upload a file to work with it.`);return}if(confirm(`Remove “${button.dataset.file}” from this device?`)){await WorkspaceStore.remove(button.dataset.fileId);files=files.filter(file=>file.id!==button.dataset.fileId);renderFiles();toast('Removed from this device.')}}});
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-task]').forEach(b=>b.addEventListener('click',()=>openTask(b.dataset.task,b.dataset.conversionDefault||'')));
$$('.filter-tab[data-filter]').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;renderFiles()}));
$('#upload-button').addEventListener('click',()=>$('#file-input').click());$('#browse-button').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('#video-upload').addEventListener('click',()=>$('#video-input').click());$('#video-input').addEventListener('change',e=>{const selected=[...e.target.files];addFiles(selected,'video');setView('videos');if(selected.length)TransformoVideoEditor.open(selected);e.target.value=''});
window.addEventListener('transformo:video-files-added',event=>addFiles(event.detail.files,'video'));
$('#video-projects').addEventListener('click',e=>{const button=e.target.closest('[data-open-video-index]');if(!button)return;const file=files.filter(item=>item.kind==='video')[Number(button.dataset.openVideoIndex)];if(file)TransformoVideoEditor.open(file.file)});
['dragenter','dragover'].forEach(name=>$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.add('drag-over')}));['dragleave','drop'].forEach(name=>$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.remove('drag-over')}));$('#drop-zone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('#tool-back').addEventListener('click',closeTool);$('#tool-cta').addEventListener('click',performCurrentTask);
$('#tool-content').addEventListener('click',event=>{
  const language=event.target.closest('[data-language-target]');
  if(language){const field=document.getElementById(language.dataset.languageTarget);if(!field)return;field.value=language.dataset.languageValue;language.closest('.language-option-grid').querySelectorAll('[data-language-target]').forEach(button=>{const selected=button===language;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});if(['source-language','target-language'].includes(field.id))discardTranslationResult();updateTaskCta();return}
  const conversion=event.target.closest('[data-conversion-option]');
  if(conversion){selectedConversion=conversion.dataset.conversionOption;updateTaskCta();return}
  const file=event.target.closest('[data-workspace-file-id]');
  if(file){const id=file.dataset.workspaceFileId,multiple=['Merge','Convert'].includes(pendingTask);if(multiple){if(workspaceSelectionIds.has(id))workspaceSelectionIds.delete(id);else workspaceSelectionIds.add(id)}else if(workspaceSelectionIds.has(id))workspaceSelectionIds.clear();else{workspaceSelectionIds.clear();workspaceSelectionIds.add(id)}$('#workspace-file-options').querySelectorAll('[data-workspace-file-id]').forEach(button=>button.setAttribute('aria-pressed',String(workspaceSelectionIds.has(button.dataset.workspaceFileId))));$('#workspace-selection-count').textContent=`${workspaceSelectionIds.size} selected`;$('#load-workspace-files').disabled=!workspaceSelectionIds.size}
});
$('#all-tools').addEventListener('click',()=>$('#tool-section').scrollIntoView({behavior:'smooth',block:'start'}));$('#search-trigger').addEventListener('click',showSearch);$('#search-input').addEventListener('input',e=>renderSearch(e.target.value));$('#search-overlay').addEventListener('click',e=>{if(e.target===$('#search-overlay'))$('#search-overlay').hidden=true});$('#search-results').addEventListener('click',e=>{const b=e.target.closest('[data-search]');if(!b)return;const value=b.dataset.search,task=value.split(' ')[0],presets={'PDF to images':'pdf-images','PDF to JPG':'pdf-jpg','PDF to text':'pdf-text','Images to PDF':'images-pdf','Text to PDF':'text-pdf'};if(presets[value]){$('#search-overlay').hidden=true;openTask('Convert',presets[value])}else if(['Translate','Edit','Organize','Convert','Merge','Split'].includes(task)){ $('#search-overlay').hidden=true;openTask(task)}else if(value==='Add a watermark'){$('#search-overlay').hidden=true;openTask('Watermark')}else if(value==='Add page numbers'){$('#search-overlay').hidden=true;openTask('Number')}else if(task==='Video'){$('#search-overlay').hidden=true;setView('videos')}else{$('#search-overlay').hidden=true;toast(`Opening ${value}`)}});
$('#start-editing').addEventListener('click',()=>$('#video-input').click());$$('[data-go-documents]').forEach(b=>b.addEventListener('click',()=>setView('documents')));
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch()}
  if(e.key==='Escape'){if($('#tool-view').classList.contains('visible'))closeTool();$('#search-overlay').hidden=true}
  if(e.key.toLowerCase()==='u'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!e.metaKey&&!e.ctrlKey)$('#file-input').click();
});
renderFiles();restoreWorkspaceFiles();
