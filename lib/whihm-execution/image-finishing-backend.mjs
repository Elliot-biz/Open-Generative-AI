import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

export const FINISH_MAX_PIXELS = 16777216;
const fault = code => Object.assign(new Error(code), { finishingCode: code });
export const color = hex => ({ r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), alpha: hex.length === 9 ? parseInt(hex.slice(7,9),16) / 255 : 1 });

// Only called with validated typed parameters; never accepts a path, command or Sharp options bag.
export async function transformImageBytes(bytes, operation, p, loadSharp = () => import('sharp')) {
  let sharp;
  try { const loaded = await loadSharp(); sharp = loaded.default || loaded; if (typeof sharp !== 'function') throw Error(); }
  catch { throw fault('FINISH_BACKEND_UNAVAILABLE'); }
  try {
    let image = sharp(Buffer.from(bytes), { limitInputPixels: FINISH_MAX_PIXELS, failOn: 'warning' }).autoOrient().timeout({ seconds: 20 });
    if (operation === 'crop') image = image.extract({ left: p.left, top: p.top, width: p.width, height: p.height });
    else if (operation === 'resize' || operation === 'contain') image = image.resize(p.width, p.height, { fit: operation === 'contain' ? 'contain' : p.fit, position: 'centre', kernel: 'lanczos3', ...(operation === 'contain' ? { background: color(p.background) } : {}) });
    else if (operation !== 'convert') throw fault('FINISH_OPERATION_UNSUPPORTED');
    if (p.flattenBackground) image = image.flatten({ background: color(p.flattenBackground) });
    if (p.metadata === 'preserve') image = image.keepMetadata();
    if (p.outputFormat === 'png') image = image.png({ compressionLevel: p.compressionLevel, progressive: false, adaptiveFiltering: false, palette: false });
    else if (p.outputFormat === 'jpeg') image = image.jpeg({ quality: p.quality, progressive: false, chromaSubsampling: '4:2:0', mozjpeg: false });
    else if (p.outputFormat === 'webp') image = image.webp({ quality: p.quality, effort: 4, lossless: false });
    else throw fault('FINISH_FORMAT_UNSUPPORTED');
    const data = await image.toBuffer();
    return { bytes: Uint8Array.from(data), backend: { id: 'sharp-image-finishing', versions: { ...sharp.versions } } };
  } catch (e) { throw e.finishingCode ? e : fault(/timeout/i.test(e.message) ? 'FINISH_TIMEOUT' : 'FINISH_TRANSFORM_FAILED'); }
}

// Worker owns no filesystem paths and writes no files, including on timeout/failure.
if (!isMainThread && workerData?.operationType === 'whihm-image-finishing') {
  try {
    const result = await transformImageBytes(workerData.bytes, workerData.operation, workerData.parameters);
    parentPort.postMessage({ ok: true, ...result }, [result.bytes.buffer]);
  } catch (e) { parentPort.postMessage({ ok: false, code: e.finishingCode || 'FINISH_TRANSFORM_FAILED' }); }
}

// Injection is trusted Node-side test plumbing, never part of host request data.
export function createImageFinisher({ WorkerClass = Worker, timeoutMs = 30000 } = {}) {
  return (bytes, operation, parameters) => new Promise((resolve, reject) => {
    let worker, timer, settled = false;
    async function finish(error, value) {
      if (settled) return; settled = true; clearTimeout(timer);
      try { await worker?.terminate(); } catch { error ||= fault('FINISH_WORKER_CLEANUP_FAILED'); }
      if (error) reject(error); else resolve(value);
    }
    try {
      worker = new WorkerClass(new URL('./image-finishing-backend.mjs', import.meta.url), {
        workerData: { operationType: 'whihm-image-finishing', bytes: Uint8Array.from(bytes), operation, parameters },
        execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
      timer = setTimeout(() => finish(fault('FINISH_TIMEOUT')), timeoutMs);
      worker.once('error', () => finish(fault('FINISH_TRANSFORM_FAILED')));
      worker.once('exit', () => finish(fault('FINISH_WORKER_EXITED')));
      worker.once('message', message => {
        if (message?.ok === false) return finish(fault(['FINISH_BACKEND_UNAVAILABLE','FINISH_TIMEOUT','FINISH_TRANSFORM_FAILED','FINISH_OPERATION_UNSUPPORTED','FINISH_FORMAT_UNSUPPORTED'].includes(message.code) ? message.code : 'FINISH_TRANSFORM_FAILED'));
        if (message?.ok !== true || !(message.bytes instanceof Uint8Array) || !message.backend?.versions?.sharp) return finish(fault('FINISH_BACKEND_OUTPUT_INVALID'));
        finish(null, { bytes: Buffer.from(message.bytes), backend: message.backend });
      });
    } catch { finish(fault('FINISH_BACKEND_UNAVAILABLE')); }
  });
}
