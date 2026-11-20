// Resolve only the explicitly selected service; never fall back from Gatey to a URL.
async function resolveService(config, gateyEndpoint) {
  if (!config || config.schemaVersion !== 1 || typeof config.apiUrl !== 'string' || !Array.isArray(config.mappings)) throw new Error('Commerce service configuration unavailable');
  const mode = config.apiConnection ?? 'direct';
  if (mode === 'direct') return {apiUrl: config.apiUrl};
  if (mode !== 'gatey' || typeof config.apiName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.apiName)) throw new Error('Commerce API is not configured');
  const endpoint = await gateyEndpoint(config.apiName);
  if (typeof endpoint !== 'string' || !endpoint) throw new Error('Commerce Gatey API unavailable');
  return {apiUrl: endpoint};
}
// Amplify's endpoint projection omits the configured authorization mode.
// Read the same active API definition as Gatey before using its endpoint.
function resolveGateyEndpoint(cognito, config, name, hostname) {
  const configurations = config?.apiConfigurations;
  const secondary = configurations?.secondary;
  const selected = secondary?.domains && String(hostname).toLowerCase().match(secondary.domains.toLowerCase()) && secondary.apis?.length ? secondary : configurations?.default;
  const api = selected?.apis?.find(api => api.name === name);
  if (!api || api.authorization !== 'ACCESS_TOKEN') throw new Error('Commerce requires a Gatey API configured with Access Token authorization');
  const endpoint = cognito?.getAmplifyConfig?.()?.API?.REST?.[name]?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint || new URL(endpoint).href !== new URL(api.endpoint).href) throw new Error('Commerce Gatey API configuration changed');
  return endpoint;
}
module.exports = {resolveService, resolveGateyEndpoint};
