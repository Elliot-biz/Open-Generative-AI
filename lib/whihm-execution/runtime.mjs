// Application bindings only. Authentication, uploads, polling and IPC remain upstream.
import * as studio from '../../packages/studio/src/muapi.js';
import * as catalog from '../../packages/studio/src/models.js';
import { getV2VExecutionModel } from '../../packages/studio/src/v2vInputContracts.js';
import { getAudioExecutionModel } from '../../packages/studio/src/audioInputContracts.js';
import { getLocalModelById } from '../../src/lib/localModels.js';
import { localAI, isLocalAIAvailable } from '../../src/lib/localInferenceClient.js';

export const routes = Object.freeze({
  t2i: ['getModelById', 'generateImage', 'image'],
  i2i: ['getI2IModelById', 'generateI2I', 'image'],
  t2v: ['getVideoModelById', 'generateVideo', 'video'],
  i2v: ['getI2VModelById', 'generateI2V', 'video'],
  audio: ['getAudioModelById', 'generateAudio', 'audio'],
  lipsync: ['getLipSyncModelById', 'processLipSync', 'video'],
  recast: ['getRecastModelById', 'processRecast', 'video'],
  motion_control: ['getMotionControlModelById', 'processMotionControl', 'video'],
  v2v: ['getV2VModelById', 'processV2V', 'video'],
});
export function findRemote(model, mode) {
  const found = Object.entries(routes).filter(([key, [lookup]]) => (!mode || key === mode) &&
    (key !== 'audio' || getAudioExecutionModel(model)) &&
    (key !== 'v2v' || getV2VExecutionModel(model)) &&
    (key !== 'motion_control' || ['seedance-2.5-motion-control', 'seedance-2-motion-control'].includes(model)) && catalog[lookup](model)?.id === model);
  if (found.length !== 1) return null;
  const [selected, [lookup, method, mediaType]] = found[0];
  return { mode: selected, method, mediaType, model: catalog[lookup](model) };
}
export { getLocalModelById };

// Shared static routing check for execution and readiness. No auth, upload,
// polling, local probes, or utility callbacks run here.
export function resolveExecutionBinding(node, { utility } = {}) {
  const executor = node.executor;
  if (executor.type === 'remote-model') {
    if (executor.provider !== 'muapi') return { code: 'PROVIDER_UNSUPPORTED' };
    const selected = findRemote(executor.model, node.metadata?.oga?.mode);
    return selected ? { selected, runtime: `studio.${selected.method}`, mediaType: selected.mediaType }
      : { code: 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS' };
  }
  if (executor.type === 'local-ai') {
    const selected = getLocalModelById(executor.model);
    return selected && selected.provider === executor.provider
      ? { selected, runtime: 'localAI.generate', mediaType: selected.type === 'video' ? 'video' : 'image' }
      : { code: 'LOCAL_MODEL_UNSUPPORTED' };
  }
  if (executor.type === 'utility') {
    return utility?.tool === executor.tool && typeof utility.run === 'function' && typeof utility.validate === 'function'
      ? { runtime: 'host.utility', mediaType: node.outputs[0]?.type || 'json' }
      : { code: 'UTILITY_UNAVAILABLE' };
  }
  return { code: 'EXECUTOR_UNSUPPORTED' };
}

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
