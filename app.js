const iconTypes={pdf:'pdf',docx:'docx',doc:'docx',xlsx:'xlsx',xls:'xlsx',pptx:'pptx',ppt:'pptx',mp4:'mp4',mov:'mp4',webm:'mp4'};
let files=[
 {name:'Q4 Brand Guidelines.pdf',ext:'PDF',size:'2.4 MB',date:'Just now',kind:'document',people:['KP','AM','JL'],tone:'pdf'},
 {name:'Product launch brief.docx',ext:'DOCX',size:'846 KB',date:'Yesterday',kind:'document',people:['KP','AM'],tone:'docx'},
 {name:'Campaign budget 2025.xlsx',ext:'XLSX',size:'1.2 MB',date:'Oct 28, 2025',kind:'document',people:['KP'],tone:'xlsx'},
 {name:'The little things.mp4',ext:'MP4',size:'84.6 MB',date:'Oct 26, 2025',kind:'video',people:['KP','JL'],tone:'mp4'},
 {name:'Creative direction.pptx',ext:'PPTX',size:'5.8 MB',date:'Oct 24, 2025',kind:'document',people:['KP','AM','JL'],tone:'pptx'}
];
let activeFilter='all', pendingTask='Translate', toastTimer, taskPages=[], selectedTaskFiles=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderFiles(){const list=$('#file-list'),shown=files.filter(f=>activeFilter==='all'||f.kind===activeFilter);$('#empty-state').hidden=shown.length>0;list.innerHTML=shown.map((f,i)=>`<div class="file-row" style="animation-delay:${i*45}ms"><div class="file-name"><span class="file-type-icon ${f.tone}">${esc(f.ext)}</span><span class="file-title-wrap">${f.id?`<button class="file-title file-open" data-open-file-id="${esc(f.id)}">${esc(f.name)}</button>`:`<div class="file-title">${esc(f.name)}</div>`}<div class="file-meta">${f.kind==='video'?'Video':f.id?'Saved on this device':'In my workspace'}</div></span></div><span class="file-date">${esc(f.date)}</span><span class="file-size">${esc(f.size)}</span><span class="sharing">${f.people.slice(0,3).map((p,n)=>`<span class="share-avatar" style="z-index:${3-n}">${esc(p)}</span>`).join('')}${f.people.length>2?'<span class="share-plus">+1</span>':''}</span><button class="row-menu" aria-label="File actions" data-file-id="${esc(f.id||'')}" data-file="${esc(f.name)}">···</button></div>`).join('');}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function setView(view){$$('.page-view').forEach(v=>v.classList.toggle('visible',v.id===`${view}-view`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#crumb-current').textContent=view==='videos'?'Video studio':view==='activity'?'Activity':'Documents';window.scrollTo({top:0,behavior:'smooth'});}
function openTask(task){
  pendingTask=task; taskPages=[]; selectedTaskFiles=[];
  const configs={Translate:['Translate a document','Translate text and keep each line anchored to its original page position.'],Edit:['Edit document text','Change extracted PDF text in place while the original file remains untouched.'],Convert:['Convert a file','Convert images and text to PDF, or export PDF pages as images.'],Merge:['Merge PDFs','Combine PDF pages in the order you choose.'],Split:['Split a PDF','Extract selected pages into a new PDF.']};
  const [title,desc]=configs[task]||configs.Translate; $('#modal-title').textContent=title; $('#modal-description').textContent=desc;
  const accepts=task==='Translate'||task==='Edit'?'application/pdf,.pdf':task==='Merge'?'application/pdf,.pdf':task==='Split'?'application/pdf,.pdf':'.pdf,.txt,image/*';
  const multiple=task==='Merge'||task==='Convert'?'multiple':'';
  let fields=`<div class="modal-field"><label for="task-files">${task==='Merge'?'Choose two or more PDF files':task==='Convert'?'Choose PDF, text, or image files':'Choose a PDF file'}</label><input id="task-files" type="file" accept="${accepts}" ${multiple} /><span class="field-help">Files stay in this browser tab. Nothing is uploaded.</span></div><div class="workspace-file-picker"><label for="workspace-file-picker">Or use a file already in your workspace</label><select id="workspace-file-picker" ${multiple}><option value="">Loading local files…</option></select><button class="secondary-button" id="load-workspace-files" type="button">Use selected files</button></div>`;
  if(task==='Split') fields+=`<div class="modal-field"><label for="page-range">Pages to extract</label><input id="page-range" placeholder="e.g. 1–4, 7, 10–12" /><span class="field-help">Page numbers start at 1.</span></div>`;
  if(task==='Convert') fields+=`<div class="modal-field"><label for="convert-format">Output</label><select id="convert-format"><option value="auto">Choose automatically</option><option value="pdf">PDF</option><option value="images">PNG page images (ZIP)</option></select></div>`;
  if(task==='Translate') fields+=`<div class="language-pair"><div class="modal-field"><label for="source-language">Translate from</label><select id="source-language"><option value="en">English</option><option value="ja">Japanese</option><option value="es">Spanish</option><option value="fr">French</option><option value="hi">Hindi</option><option value="ta">Tamil</option></select></div><div class="language-arrow">→</div><div class="modal-field"><label for="target-language">Translate to</label><select id="target-language"><option value="ja">Japanese</option><option value="es">Spanish</option><option value="fr">French</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="en">English</option></select></div></div><div class="position-note">✧ <span>Text is redrawn at the same page coordinates. The translated PDF is image-backed to keep non-Latin scripts and layout intact.</span></div><button class="secondary-button" id="translate-lines" type="button">Translate extracted lines</button>`;
  if(task==='Edit') fields+=`<div class="position-note">✧ <span>Changing text keeps its original anchor. The edited PDF is image-backed to preserve visual fidelity.</span></div>`;
  if(task==='Edit'||task==='Translate') fields+=`<div id="line-editor" class="line-editor" hidden></div>`;
  $('#modal-content').innerHTML=fields;
  $('#modal-cta').innerHTML=task==='Merge'?'Merge PDFs <span>↗</span>':task==='Split'?'Extract pages <span>↗</span>':task==='Translate'?'Export translated PDF <span>↗</span>':task==='Edit'?'Export edited PDF <span>↗</span>':'Convert and download <span>↗</span>';
  $('#task-files').addEventListener('change',loadTaskFiles);
  $('#load-workspace-files').addEventListener('click',loadWorkspaceSelection);
  populateWorkspacePicker(task);
  if(task==='Translate') $('#translate-lines').addEventListener('click',translateCurrentLines);
  $('#modal-backdrop').hidden=false; document.body.style.overflow='hidden';
}
async function loadTaskFiles(event){
  selectedTaskFiles=[...event.target.files];
  await addFiles(selectedTaskFiles);
  await analyzeTaskFiles();
}
async function populateWorkspacePicker(task){
  const select=$('#workspace-file-picker');if(!select)return;
  try{
    const records=await WorkspaceStore.list(),isPdfOnly=['Edit','Translate','Split','Merge'].includes(task);
    const eligible=records.filter(record=>{const name=record.name.toLowerCase(),isPdf=name.endsWith('.pdf'),isVideo=record.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/.test(name);return isPdfOnly?isPdf:task==='Convert'?!isVideo:true});
    select.innerHTML=eligible.length?eligible.map(record=>`<option value="${esc(record.id)}">${esc(record.name)} · ${record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`}</option>`).join(''):'<option value="">No saved files yet</option>';
  }catch{select.innerHTML='<option value="">Local storage is unavailable</option>'}
}
async function loadWorkspaceSelection(){
  const select=$('#workspace-file-picker'),ids=[...select.selectedOptions].map(option=>option.value).filter(Boolean);
  if(!ids.length){toast('Choose a saved file first.');return}
  try{const records=await Promise.all(ids.map(id=>WorkspaceStore.get(id)));selectedTaskFiles=records.filter(Boolean).map(record=>record.file);await analyzeTaskFiles();toast(`${selectedTaskFiles.length} saved file${selectedTaskFiles.length===1?'':'s'} loaded.`)}catch(error){toast(error.message)}
}
async function analyzeTaskFiles(){
  if(!selectedTaskFiles.length)return;
  if((pendingTask==='Edit'||pendingTask==='Translate')&&selectedTaskFiles.length===1){
    try{taskPages=await DocumentEngine.inspectPdf(selectedTaskFiles[0]);renderLineEditor();toast(`Found text on ${taskPages.length} page${taskPages.length===1?'':'s'}.`)}catch(error){toast(error.message)}
  } else toast(`${selectedTaskFiles.length} file${selectedTaskFiles.length===1?'':'s'} ready.`);
}
function renderLineEditor(){
  const root=$('#line-editor'); if(!root)return;
  const total=taskPages.reduce((n,p)=>n+p.lines.length,0);
  const needsOcr=taskPages.some(page=>!page.lines.length);
  const ocrPanel='<div class="position-note">Some pages have no selectable text. Run local OCR on those pages to include them in editing and translation.</div><div class="ocr-controls"><select id="ocr-language" aria-label="OCR language"><option value="eng">English</option><option value="hin">Hindi</option><option value="tam">Tamil</option><option value="jpn">Japanese</option><option value="spa">Spanish</option><option value="fra">French</option></select><button class="secondary-button" id="run-ocr" type="button">Run OCR on scanned pages</button><span id="ocr-progress" class="field-help"></span></div>';
  if(!total){root.hidden=false;root.innerHTML=ocrPanel;$('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);return}
  root.hidden=false;
  root.innerHTML=(needsOcr?ocrPanel:'')+`<div class="editor-heading"><strong>${total} positioned text lines</strong><span>Edit a line or translate all</span></div>`+taskPages.map((page,index)=>`<details class="editor-page" ${index===0?'open':''}><summary>Page ${index+1} <span>${page.lines.length} lines</span></summary><div class="editor-lines">${page.lines.map((line,i)=>{const flat=taskPages.slice(0,index).reduce((n,p)=>n+p.lines.length,0)+i;return `<label class="editor-line"><span>${esc(line.text.slice(0,36))}${line.text.length>36?'…':''}</span><textarea data-line-index="${flat}" rows="2">${esc(line.edited??line.text)}</textarea></label>`}).join('')}</div></details>`).join('');
  if(needsOcr)$('#run-ocr').addEventListener('click',runOcrOnCurrentPdf);
}
async function runOcrOnCurrentPdf(){
  if(!selectedTaskFiles[0]){toast('Choose a PDF first.');return}
  const button=$('#run-ocr'),progress=$('#ocr-progress');button.disabled=true;button.textContent='Starting OCR…';
  try{taskPages=await DocumentEngine.ocrPdf(selectedTaskFiles[0],$('#ocr-language').value,message=>{if(message.status==='recognizing text')button.textContent=`Reading pages ${Math.round(message.progress*100)}%…`;else if(message.status)button.textContent=`${message.status}…`},taskPages);renderLineEditor();const total=taskPages.reduce((n,p)=>n+p.lines.length,0);toast(total?`OCR found ${total} text lines. Review them before export.`:'OCR could not find readable text in this file.');}
  catch(error){progress.textContent=error.message;toast(error.message)}finally{const retry=$('#run-ocr');if(retry){retry.disabled=false;retry.textContent='Run OCR on this PDF'}}
}
function readEditedLines(){let index=0;for(const page of taskPages)for(const line of page.lines){const input=$(`[data-line-index="${index++}"]`);if(input)line.edited=input.value}}
async function translateCurrentLines(){
  if(!taskPages.length){toast('Choose a text-based PDF first.');return}
  readEditedLines(); const button=$('#translate-lines');button.disabled=true;button.textContent='Translating…';
  try{await DocumentEngine.translateLines(taskPages,$('#source-language').value,$('#target-language').value,(done,total)=>{if(done%5===0||done===total)button.textContent=`Translating ${done}/${total}…`});renderLineEditor();toast('Translation is ready to review.')}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Translate extracted lines'}
}
async function performCurrentTask(){
  const button=$('#modal-cta');button.disabled=true;const label=button.textContent;button.textContent='Working…';
  try{
    if(pendingTask==='Merge') toast(await DocumentEngine.mergePdfs(selectedTaskFiles));
    else if(pendingTask==='Split'){if(!selectedTaskFiles[0])throw new Error('Choose a PDF first.');toast(await DocumentEngine.splitPdf(selectedTaskFiles[0],$('#page-range').value))}
    else if(pendingTask==='Convert'){
      if(!selectedTaskFiles.length)throw new Error('Choose a file first.');
      const out=$('#convert-format').value;
      if(out==='images'||(out==='auto'&&selectedTaskFiles[0].name.toLowerCase().endsWith('.pdf')))toast(await DocumentEngine.pdfToImages(selectedTaskFiles[0]));
      else if(selectedTaskFiles.every(f=>f.type.startsWith('image/')))toast(await DocumentEngine.imagesToPdf(selectedTaskFiles));
      else if(selectedTaskFiles[0].name.toLowerCase().endsWith('.txt'))toast(await DocumentEngine.textToPdf(selectedTaskFiles[0]));
      else throw new Error('This conversion is not available for that format yet. Try PDF, TXT, PNG, or JPEG.');
    } else if(pendingTask==='Edit'||pendingTask==='Translate'){
      if(!selectedTaskFiles[0]||!taskPages.length)throw new Error('Choose a text-based PDF first.');readEditedLines();
      const longLines=await DocumentEngine.exportPositionedPdf(selectedTaskFiles[0],taskPages);toast(longLines?`PDF downloaded. Review ${longLines} long line${longLines===1?'':'s'} for fit.`:pendingTask==='Translate'?'Translated PDF downloaded.':'Edited PDF downloaded.');
    }
  }catch(error){toast(error.message||'Could not complete this operation.')}finally{button.disabled=false;button.innerHTML=label}
}
function closeModal(){$('#modal-backdrop').hidden=true;document.body.style.overflow=''}
async function addFiles(fileList,kind){const incoming=[...fileList];if(!incoming.length)return;let saved=0;for(const file of incoming){const ext=(file.name.split('.').pop()||'file').toLowerCase();let record;try{record=await WorkspaceStore.save(file);saved++}catch(error){toast(`${file.name} is available until this tab closes; local storage could not save it.`)}files.unshift({id:record?.id,name:file.name,ext:ext.toUpperCase().slice(0,5),size:file.size>1048576?`${(file.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(file.size/1024))} KB`,date:'Just now',kind:kind||(['mp4','mov','webm'].includes(ext)?'video':'document'),people:['KP'],tone:iconTypes[ext]||'docx',file});}renderFiles();toast(`${incoming.length} ${incoming.length===1?'file':'files'} added${saved?` · ${saved} saved on this device`:''}`);}
async function restoreWorkspaceFiles(){try{const records=await WorkspaceStore.list();const restored=records.map(record=>{const ext=(record.name.split('.').pop()||'file').toLowerCase();return{id:record.id,name:record.name,ext:ext.toUpperCase().slice(0,5),size:record.size>1048576?`${(record.size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(record.size/1024))} KB`,date:'Saved locally',kind:record.type.startsWith('video/')?'video':'document',people:['KP'],tone:iconTypes[ext]||'docx',file:record.file}});files=[...restored,...files.filter(file=>!file.id||!restored.some(record=>record.id===file.id))];renderFiles()}catch{}}
function showSearch(){const el=$('#search-overlay');el.hidden=false;setTimeout(()=>$('#search-input').focus(),25);renderSearch('')}
function renderSearch(q){const terms=[...new Set([...files.map(f=>f.name), 'Translate a document','Edit document','Convert format','Merge documents','Split pages','Video studio'])];const results=terms.filter(x=>!q||x.toLowerCase().includes(q.toLowerCase())).slice(0,6);$('#search-results').innerHTML=results.map(x=>`<button class="search-result" data-search="${esc(x)}">${esc(x)}<small>${x.includes('.')?'File':'Tool'}</small></button>`).join('')}
$('#file-list').addEventListener('click',async e=>{const open=e.target.closest('[data-open-file-id]');if(open){const record=await WorkspaceStore.get(open.dataset.openFileId);if(!record){toast('That local file is no longer available.');return}if(record.type.startsWith('video/')){TransformoVideoEditor.open(record.file);return}const task=record.name.toLowerCase().endsWith('.pdf')?'Edit':'Convert';openTask(task);selectedTaskFiles=[record.file];await analyzeTaskFiles();return}const button=e.target.closest('.row-menu');if(button){if(!button.dataset.fileId){toast(`${button.dataset.file} is a sample item. Upload a file to work with it.`);return}if(confirm(`Remove “${button.dataset.file}” from this device?`)){await WorkspaceStore.remove(button.dataset.fileId);files=files.filter(file=>file.id!==button.dataset.fileId);renderFiles();toast('Removed from this device.')}}});
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-task]').forEach(b=>b.addEventListener('click',()=>openTask(b.dataset.task)));
$$('.filter-tab[data-filter]').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeFilter=b.dataset.filter;renderFiles()}));
$('#upload-button').addEventListener('click',()=>$('#file-input').click());$('#browse-button').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('#video-upload').addEventListener('click',()=>$('#video-input').click());$('#video-input').addEventListener('change',e=>{const selected=[...e.target.files];addFiles(selected,'video');setView('videos');if(selected[0])TransformoVideoEditor.open(selected[0]);e.target.value=''});
['dragenter','dragover'].forEach(name=>$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.add('drag-over')}));['dragleave','drop'].forEach(name=>$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.remove('drag-over')}));$('#drop-zone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('#modal-close').addEventListener('click',closeModal);$('#modal-backdrop').addEventListener('click',e=>{if(e.target===$('#modal-backdrop'))closeModal()});$('#modal-cta').addEventListener('click',performCurrentTask);
$('#all-tools').addEventListener('click',()=>openTask('Translate'));$('#search-trigger').addEventListener('click',showSearch);$('#search-input').addEventListener('input',e=>renderSearch(e.target.value));$('#search-overlay').addEventListener('click',e=>{if(e.target===$('#search-overlay'))$('#search-overlay').hidden=true});$('#search-results').addEventListener('click',e=>{const b=e.target.closest('[data-search]');if(!b)return;const task=b.dataset.search.split(' ')[0];if(['Translate','Edit','Convert','Merge','Split'].includes(task)){ $('#search-overlay').hidden=true;openTask(task)}else if(task==='Video'){$('#search-overlay').hidden=true;setView('videos')}else{$('#search-overlay').hidden=true;toast(`Opening ${b.dataset.search}`)}});
$('#start-editing').addEventListener('click',()=>$('#video-input').click());$$('[data-go-documents]').forEach(b=>b.addEventListener('click',()=>setView('documents')));$('#video-projects').innerHTML=['Sunday in the city','Soft focus — launch film','A place to breathe'].map((n,i)=>`<article class="video-project-card"><div class="project-thumb ${i===1?'thumb-two':i===2?'thumb-three':''}"><button class="project-play">▶</button></div><div class="project-meta"><span class="project-name">${n}</span><span class="project-duration">${i===0?'01:42':i===1?'00:38':'02:16'}</span></div><div class="project-updated">Edited ${i===0?'2 hours ago':i===1?'Yesterday':'Oct 22'}</div></article>`).join('');
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showSearch()}
  if(e.key==='Escape'){closeModal();$('#search-overlay').hidden=true}
  if(e.key.toLowerCase()==='u'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!e.metaKey&&!e.ctrlKey)$('#file-input').click();
});
renderFiles();restoreWorkspaceFiles();
