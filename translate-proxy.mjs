import http from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.TRANSFORMO_TRANSLATE_PORT || 8766);
const apiKey = (process.env.DEEPL_API_KEY || '').trim();
const apiUrl = process.env.DEEPL_API_URL || (apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');
const allowedApiHosts = new Set(['api-free.deepl.com', 'api.deepl.com']);
const requestsByAddress = new Map();
const maxBodyBytes = 128 * 1024;
const maxTextBytes = 100 * 1024;

function localOrigin(origin = '') {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch { return false; }
}

function send(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(localOrigin(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {})
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('Translation request is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Expected a valid JSON request.'), { statusCode: 400 }); }
}

function rateAllowed(address) {
  const now = Date.now(), windowMs = 60_000, current = requestsByAddress.get(address) || { start: now, count: 0 };
  if (now - current.start >= windowMs) { current.start = now; current.count = 0; }
  current.count++;
  requestsByAddress.set(address, current);
  return current.count <= 30;
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (origin && !localOrigin(origin)) { send(response, 403, { error: 'Only local Transformo pages may use this bridge.' }); return; }
  if (request.method === 'OPTIONS') {
    if (!localOrigin(origin)) { send(response, 403, { error: 'Only local Transformo pages may use this bridge.' }); return; }
    response.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'Access-Control-Max-Age': '600' });
    response.end(); return;
  }
  const path = new URL(request.url, `http://${host}:${port}`).pathname;
  if (request.method === 'GET' && path === '/health') { send(response, 200, { ready: !!apiKey }, origin); return; }
  if (request.method !== 'POST' || path !== '/translate') { send(response, 404, { error: 'Route not found.' }, origin); return; }
  if (!localOrigin(origin)) { send(response, 403, { error: 'The translation bridge accepts requests only from a local Transformo page.' }); return; }
  if (!rateAllowed(request.socket.remoteAddress || 'local')) { send(response, 429, { error: 'Too many translation batches. Wait a minute and try again.' }, origin); return; }
  if (!apiKey) { send(response, 503, { error: 'Add a DeepL API key to the local environment before using online translation.' }, origin); return; }
  let destination;
  try { destination = new URL(apiUrl); } catch { send(response, 500, { error: 'DEEPL_API_URL is not a valid URL.' }, origin); return; }
  if (destination.protocol !== 'https:' || !allowedApiHosts.has(destination.hostname) || destination.pathname !== '/v2/translate') { send(response, 500, { error: 'DEEPL_API_URL must use an official DeepL translation endpoint.' }, origin); return; }
  try {
    const input = await readJson(request);
    const texts = input?.texts, sourceLanguage = String(input?.sourceLanguage || ''), targetLanguage = String(input?.targetLanguage || '');
    const languageCode = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/;
    if (!Array.isArray(texts) || !texts.length || texts.length > 24 || texts.some(text => typeof text !== 'string' || !text.trim())) throw Object.assign(new Error('Send between 1 and 24 non-empty text blocks per request.'), { statusCode: 400 });
    if (!languageCode.test(sourceLanguage) || !languageCode.test(targetLanguage) || sourceLanguage.toLowerCase() === targetLanguage.toLowerCase()) throw Object.assign(new Error('Choose two different supported language codes.'), { statusCode: 400 });
    if (texts.some(text => Buffer.byteLength(text, 'utf8') > 10_000) || texts.reduce((total, text) => total + Buffer.byteLength(text, 'utf8'), 0) > maxTextBytes) throw Object.assign(new Error('This translation batch is too large. Try fewer or shorter text blocks.'), { statusCode: 413 });
    const apiResponse = await fetch(destination, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts, source_lang: sourceLanguage.toUpperCase(), target_lang: targetLanguage.toUpperCase() }),
      signal: AbortSignal.timeout(45_000)
    });
    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const message = typeof result.message === 'string' ? result.message : `DeepL returned HTTP ${apiResponse.status}.`;
      send(response, apiResponse.status === 456 ? 429 : 502, { error: message }, origin); return;
    }
    const translations = result.translations?.map(item => item?.text);
    if (!Array.isArray(translations) || translations.length !== texts.length || translations.some(text => typeof text !== 'string')) { send(response, 502, { error: 'DeepL returned an incomplete translation batch.' }, origin); return; }
    send(response, 200, { translations }, origin);
  } catch (error) {
    send(response, error.statusCode || (error.name === 'TimeoutError' ? 504 : 500), { error: error.message || 'Online translation failed.' }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`Transformo translation bridge listening on http://${host}:${port}`);
  console.log(apiKey ? 'DeepL key is loaded; no request text or API key is logged.' : 'Set DEEPL_API_KEY in this terminal before translating online.');
});
