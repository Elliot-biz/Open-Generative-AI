// Application bindings only. Authentication, uploads, polling and IPC remain upstream.
import * as studio from '../../packages/studio/src/muapi.js';
import * as catalog from '../../packages/studio/src/models.js';
import { getLocalModelById } from '../../src/lib/localModels.js';
import { localAI, isLocalAIAvailable } from '../../src/lib/localInferenceClient.js';

export const routes = Object.freeze({
  t2i: ['getModelById', 'generateImage', 'image'],
  i2i: ['getI2IModelById', 'generateI2I', 'image'],
  t2v: ['getVideoModelById', 'generateVideo', 'video'],
  i2v: ['getI2VModelById', 'generateI2V', 'video'],
  audio: ['getAudioModelById', 'generateAudio', 'audio'],
  lipsync: ['getLipSyncModelById', 'processLipSync', 'video'],
});
export function findRemote(model, mode) {
  const found = Object.entries(routes).filter(([key, [lookup]]) => (!mode || key === mode) && catalog[lookup](model)?.id === model);
  if (found.length !== 1) return null;
  const [selected, [lookup, method, mediaType]] = found[0];
  return { mode: selected, method, mediaType, model: catalog[lookup](model) };
}
export { getLocalModelById };

/** Credentials stay in this closure, supplied by the existing host auth context.
 * fileFromPath is a host File loader, not an upload client. Node has no XHR.
 * Overrides are a test/host boundary, not a provider registry.
 */
export function createApplicationRuntime({ getApiKey, fileFromPath, remote = studio, local = localAI, localAvailable = isLocalAIAvailable } = {}) {
  const key = async () => {
    const value = await getApiKey?.();
    if (!value) throw new Error('Authentication required');
    return value;
  };
  return {
    localAvailable,
    canUpload: () => typeof fileFromPath === 'function',
    async upload(asset) { return remote.uploadFile(await key(), await fileFromPath(asset.resolvedPath, asset)); },
    async remote(method, parameters) { return remote[method](await key(), parameters); },
    async local(parameters) { return local.generate(parameters); },
  };
}
