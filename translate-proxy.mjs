import http from 'node:http';
import { createTranslationRequest, extractTranslations } from './translation-provider.mjs';

const host = '127.0.0.1';
const port = Number(process.env.TRANSFORMO_TRANSLATE_PORT || 8766);
const deepLKey = (process.env.DEEPL_API_KEY || '').trim();
const deepLUrl = process.env.DEEPL_API_URL || (deepLKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');
const azureKey = (process.env.TRANSFORMO_TRANSLATOR_KEY || '').trim();
const azureRegion = (process.env.TRANSFORMO_TRANSLATOR_REGION || '').trim();
const providers = new Set(['azure', 'deepl']);
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
  if (request.method === 'GET' && path === '/health') {
    const provider = new URL(request.url, `http://${host}:${port}`).searchParams.get('provider') || 'azure';
    if (!providers.has(provider)) { send(response, 400, { error: 'Unknown translation provider.' }, origin); return; }
    send(response, 200, { ready: provider === 'azure' ? !!azureKey : !!deepLKey, provider }, origin); return;
  }
  if (request.method !== 'POST' || path !== '/translate') { send(response, 404, { error: 'Route not found.' }, origin); return; }
  if (!localOrigin(origin)) { send(response, 403, { error: 'The translation bridge accepts requests only from a local Transformo page.' }); return; }
  if (!rateAllowed(request.socket.remoteAddress || 'local')) { send(response, 429, { error: 'Too many translation batches. Wait a minute and try again.' }, origin); return; }
  try {
    const input = await readJson(request);
    const provider = String(input?.provider || 'azure');
    const texts = input?.texts, sourceLanguage = String(input?.sourceLanguage || ''), targetLanguage = String(input?.targetLanguage || '');
    if (!providers.has(provider)) throw Object.assign(new Error('Choose Azure Translator or DeepL as the online provider.'), { statusCode: 400 });
    const languageCode = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/;
    if (!Array.isArray(texts) || !texts.length || texts.length > 24 || texts.some(text => typeof text !== 'string' || !text.trim())) throw Object.assign(new Error('Send between 1 and 24 non-empty text blocks per request.'), { statusCode: 400 });
    if (!languageCode.test(sourceLanguage) || !languageCode.test(targetLanguage) || sourceLanguage.toLowerCase() === targetLanguage.toLowerCase()) throw Object.assign(new Error('Choose two different supported language codes.'), { statusCode: 400 });
    if (texts.some(text => Buffer.byteLength(text, 'utf8') > 10_000) || texts.reduce((total, text) => total + Buffer.byteLength(text, 'utf8'), 0) > maxTextBytes) throw Object.assign(new Error('This translation batch is too large. Try fewer or shorter text blocks.'), { statusCode: 413 });
    const { destination, headers, body } = createTranslationRequest(provider, { texts, sourceLanguage, targetLanguage, azureKey, azureRegion, deepLKey, deepLUrl });
    const apiResponse = await fetch(destination, { method: 'POST', headers, body, signal: AbortSignal.timeout(45_000) });
    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const providerMessage = result.error?.message || result.message;
      const message = typeof providerMessage === 'string' ? providerMessage : `${provider === 'azure' ? 'Azure Translator' : 'DeepL'} returned HTTP ${apiResponse.status}.`;
      send(response, apiResponse.status === 456 || apiResponse.status === 429 ? 429 : 502, { error: message }, origin); return;
    }
    const translations = extractTranslations(provider, result);
    if (!Array.isArray(translations) || translations.length !== texts.length || translations.some(text => typeof text !== 'string')) { send(response, 502, { error: `${provider === 'azure' ? 'Azure Translator' : 'DeepL'} returned an incomplete translation batch.` }, origin); return; }
    send(response, 200, { translations }, origin);
  } catch (error) {
    send(response, error.statusCode || (error.name === 'TimeoutError' ? 504 : 500), { error: error.message || 'Online translation failed.' }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`Transformo translation bridge listening on http://${host}:${port}`);
  console.log(azureKey || deepLKey ? `Online provider ready: ${[azureKey && 'Azure Translator', deepLKey && 'DeepL'].filter(Boolean).join(', ')}. No request text or API key is logged.` : 'Set TRANSFORMO_TRANSLATOR_KEY for Azure Translator (free F0 tier) or DEEPL_API_KEY for DeepL.');
});
