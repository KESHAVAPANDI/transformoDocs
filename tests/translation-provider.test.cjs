const test = require('node:test');
const assert = require('node:assert/strict');
test('builds Azure requests with the regional key and supported simplified Chinese code', async () => {
  const { createTranslationRequest } = await import('../translation-provider.mjs');
  const request = createTranslationRequest('azure', {
    texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'zh', azureKey: 'secret', azureRegion: 'eastus'
  });
  assert.equal(request.destination.origin, 'https://api.cognitive.microsofttranslator.com');
  assert.equal(request.destination.searchParams.get('api-version'), '3.0');
  assert.equal(request.destination.searchParams.get('from'), 'en');
  assert.equal(request.destination.searchParams.get('to'), 'zh-Hans');
  assert.equal(request.headers['Ocp-Apim-Subscription-Key'], 'secret');
  assert.equal(request.headers['Ocp-Apim-Subscription-Region'], 'eastus');
  assert.deepEqual(JSON.parse(request.body), [{ text: 'Hello' }]);
});

test('builds DeepL requests with its authenticated text-array format', async () => {
  const { createTranslationRequest } = await import('../translation-provider.mjs');
  const request = createTranslationRequest('deepl', {
    texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'ja', deepLKey: 'secret:fx', deepLUrl: 'https://api-free.deepl.com/v2/translate'
  });
  assert.equal(request.destination.hostname, 'api-free.deepl.com');
  assert.equal(request.headers.Authorization, 'DeepL-Auth-Key secret:fx');
  assert.deepEqual(JSON.parse(request.body), { text: ['Hello'], source_lang: 'EN', target_lang: 'JA' });
});

test('extracts complete translation batches for both providers', async () => {
  const { extractTranslations } = await import('../translation-provider.mjs');
  assert.deepEqual(extractTranslations('azure', [{ translations: [{ text: 'Hola' }] }]), ['Hola']);
  assert.deepEqual(extractTranslations('deepl', { translations: [{ text: 'こんにちは' }] }), ['こんにちは']);
  assert.equal(extractTranslations('azure', { translations: [] }), null);
});

test('rejects a non-official DeepL endpoint', async () => {
  const { createTranslationRequest } = await import('../translation-provider.mjs');
  assert.throws(() => createTranslationRequest('deepl', {
    texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'ja', deepLKey: 'secret', deepLUrl: 'https://attacker.example/v2/translate'
  }), /official DeepL/);
});

test('requires an Azure key and rejects unknown providers', async () => {
  const { createTranslationRequest } = await import('../translation-provider.mjs');
  assert.throws(() => createTranslationRequest('azure', {
    texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'ja'
  }), error => error.statusCode === 503);
  assert.throws(() => createTranslationRequest('unknown', {
    texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'ja'
  }), /Choose Azure Translator or DeepL/);
});
