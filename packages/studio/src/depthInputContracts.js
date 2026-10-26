// Scoped dual-media contract. Discovery and execution remain in the Studio catalog/service.
import { getV2VModelById } from './models.js';
import { isVideoInputUrl } from './videoInputContracts.js';

export function getDepthModel(id) {
  return id === 'depth-anything' ? getV2VModelById(id) : null;
}
export function getDepthMediaInputs() {
  return ['image', 'video'].map(type => ({ field: `${type}_url`, type, role: `source-${type}`, isArray: false, projectAsset: true, required: false }));
}
function need(value, code, path = '') {
  if (!value) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
export function buildDepthRequest(params = {}) {
  need(params && typeof params === 'object' && !Array.isArray(params), 'DEPTH_REQUEST_INVALID');
  const model = getDepthModel(params.model);
  need(model, 'DEPTH_MODEL_UNSUPPORTED', 'model');
  for (const field of Object.keys(params)) need(['model', 'onRequestId', 'image_url', 'video_url'].includes(field), 'DEPTH_OPTION_UNSUPPORTED', field);
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'DEPTH_OPTION_INVALID', 'onRequestId');
  const fields = ['image_url', 'video_url'].filter(field => params[field] !== undefined);
  need(fields.length === 1, 'DEPTH_INPUT_XOR');
  const field = fields[0];
  need(isVideoInputUrl(params[field]), 'DEPTH_MEDIA_INVALID', field);
  const sourceKind = field === 'image_url' ? 'image' : 'video';
  const payload = { [field]: params[field] };
  const requiredMedia = getDepthMediaInputs().map(role => ({ ...role, required: role.field === field, supplied: role.field === field }));
  return { endpoint: model.endpoint, payload, requiredMedia, supportedOptions: [], effectiveOptions: {},
    depth: { capability: 'ESTIMATE_DEPTH', sourceKind, resultKind: `depth-${sourceKind}`, expectedMediaType: sourceKind,
      inputRule: 'exactly-one-image-or-video', media: requiredMedia,
      providerRequest: { endpoint: model.endpoint, payload: { ...payload } }, runtimeVerification: 'UNVERIFIED',
      caveat: 'Depth artifact only; no metric distance, calibration, masks, segmentation, sequences, point clouds, meshes or deterministic geometry guarantee. Output fidelity is runtime-unverified.' },
  };
}

export function getDepthInputDescription(id) {
  if (!getDepthModel(id)) return null;
  const roles = getDepthMediaInputs();
  return { capability: 'DEPTH_ESTIMATION', roles,
    constraints: [{ kind: 'exactly_one', fields: roles.map(r => r.field) }],
    results: roles.map(r => ({ sourceKind: r.type, kind: `depth-${r.type}`, mediaType: r.type })) };
}
