const providers = new Set(['azure', 'deepl']);

export function createTranslationRequest(provider, { texts, sourceLanguage, targetLanguage, azureKey = '', azureRegion = '', deepLKey = '', deepLUrl = '' }) {
  if (!providers.has(provider)) throw new Error('Choose Azure Translator or DeepL as the online provider.');
  if (provider === 'azure') {
    if (!azureKey) throw Object.assign(new Error('Add TRANSFORMO_TRANSLATOR_KEY to the local environment before using Azure Translator.'), { statusCode: 503 });
    const destination = new URL('https://api.cognitive.microsofttranslator.com/translate');
    destination.searchParams.set('api-version', '3.0');
    destination.searchParams.set('from', sourceLanguage === 'zh' ? 'zh-Hans' : sourceLanguage);
    destination.searchParams.set('to', targetLanguage === 'zh' ? 'zh-Hans' : targetLanguage);
    const headers = { 'Ocp-Apim-Subscription-Key': azureKey, 'Content-Type': 'application/json' };
    if (azureRegion) headers['Ocp-Apim-Subscription-Region'] = azureRegion;
    return { destination, headers, body: JSON.stringify(texts.map(text => ({ text }))) };
  }
  if (!deepLKey) throw Object.assign(new Error('Add DEEPL_API_KEY to the local environment before using DeepL.'), { statusCode: 503 });
  let destination;
  try { destination = new URL(deepLUrl); }
  catch { throw Object.assign(new Error('DEEPL_API_URL is not a valid URL.'), { statusCode: 500 }); }
  if (destination.protocol !== 'https:' || !['api-free.deepl.com', 'api.deepl.com'].includes(destination.hostname) || destination.pathname !== '/v2/translate') throw Object.assign(new Error('DEEPL_API_URL must use an official DeepL translation endpoint.'), { statusCode: 500 });
  return {
    destination,
    headers: { Authorization: `DeepL-Auth-Key ${deepLKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, source_lang: sourceLanguage.toUpperCase(), target_lang: targetLanguage.toUpperCase() })
  };
}

export function extractTranslations(provider, result) {
  if (provider === 'azure') return Array.isArray(result) ? result.map(item => item?.translations?.[0]?.text) : null;
  return Array.isArray(result?.translations) ? result.translations.map(item => item?.text) : null;
}
