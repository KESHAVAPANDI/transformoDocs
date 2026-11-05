/* IndexedDB file shelf and named video projects: media stays in this browser profile on this device. */
(() => {
  const DB_NAME = 'transformo-workspace', DB_VERSION = 2, STORE = 'files', VIDEO_PROJECTS = 'video-projects';
  let openPromise;
  function open() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local file storage.'));
    if (openPromise) return openPromise;
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); if (!request.result.objectStoreNames.contains(VIDEO_PROJECTS)) request.result.createObjectStore(VIDEO_PROJECTS, { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open your local workspace.'));
      request.onblocked = () => reject(new Error('Close another Transformo tab to finish updating local storage.'));
    });
    return openPromise;
  }
  function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('Local storage operation failed.')); }); }
  async function save(file) {
    const db = await open(), id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record = { id, name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, created: Date.now(), file };
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(record);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('The browser could not save this file.')) });
    return record;
  }
  async function list() { const db = await open(), records = await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).getAll()); return records.sort((a,b)=>b.created-a.created); }
  async function get(id) { const db = await open(); return (await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) || null; }
  async function remove(id) { const db = await open(), tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); }
  async function saveVideoProject(project) {
    const db = await open(), now = Date.now(), existing = project.id ? await getVideoProject(project.id) : null, record = { ...project, createdAt: existing?.createdAt || project.createdAt || now, updatedAt: now };
    const tx = db.transaction(VIDEO_PROJECTS, 'readwrite'); tx.objectStore(VIDEO_PROJECTS).put(record);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('The browser could not save this video project.')); });
    return record;
  }
  async function listVideoProjects() { const db = await open(), records = await requestResult(db.transaction(VIDEO_PROJECTS, 'readonly').objectStore(VIDEO_PROJECTS).getAll()); return records.sort((a, b) => b.updatedAt - a.updatedAt); }
  async function getVideoProject(id) { const db = await open(); return (await requestResult(db.transaction(VIDEO_PROJECTS, 'readonly').objectStore(VIDEO_PROJECTS).get(id))) || null; }
  async function removeVideoProject(id) { const db = await open(), tx = db.transaction(VIDEO_PROJECTS, 'readwrite'); tx.objectStore(VIDEO_PROJECTS).delete(id); return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
  window.WorkspaceStore = { save, list, get, remove, saveVideoProject, listVideoProjects, getVideoProject, removeVideoProject };
})();
