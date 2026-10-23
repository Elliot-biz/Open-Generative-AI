// Electron 33 uses Node 20.18, before default ESM syntax detection. Limit the
// compatibility hint to existing ESM source; do not change upstream package type.
const roots = [new URL('../../packages/studio/src/', import.meta.url).href];
const files = new Set(['localModels.js', 'localInferenceClient.js'].map(name => new URL(`../../src/lib/${name}`, import.meta.url).href));
export function load(url, context, nextLoad) {
  if (files.has(url) || (roots.some(root => url.startsWith(root)) && url.endsWith('.js'))) return nextLoad(url, { ...context, format: 'module' });
  return nextLoad(url, context);
}
