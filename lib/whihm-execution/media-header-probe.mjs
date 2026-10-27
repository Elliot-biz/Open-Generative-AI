// Bounded header inspection only. Never follow media references, decode samples or run tools.
const need = (value, code = 'MEDIA_UNREADABLE') => { if (!value) throw Object.assign(new Error(code), { inspectionCode: code }); };
const finite = value => Number.isFinite(value) && value >= 0 ? value : null;
export function dimensions(width, height) {
  return { width, height, aspectRatio: width > 0 && height > 0 ? width / height : null,
    orientation: width > 0 && height > 0 ? width === height ? 'square' : width > height ? 'landscape' : 'portrait' : null };
}
function ratio(numerator, denominator) {
  return numerator > 0 && denominator > 0 ? { numerator, denominator, value: numerator / denominator } : null;
}
function imageSignature(b) {
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpeg';
  if (['GIF87a','GIF89a'].includes(b.toString('latin1', 0, 6))) return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (['49492a00','4d4d002a','49492b00','4d4d002b'].includes(b.subarray(0, 4).toString('hex'))) return 'tiff';
  return null;
}
export async function probeImage(bytes, loadSharp = () => import('sharp')) {
  const signature = imageSignature(bytes); need(signature, 'MEDIA_FORMAT_UNSUPPORTED');
  let sharp;
  try { const loaded = await loadSharp(); sharp = loaded.default || loaded; need(typeof sharp === 'function'); }
  catch { need(false, 'MEDIA_BACKEND_UNAVAILABLE'); }
  let m;
  try { m = await sharp(bytes, { limitInputPixels: 268402689 }).metadata(); }
  catch { need(false); }
  need(m && m.format === signature && Number.isInteger(m.width) && Number.isInteger(m.height) && m.width > 0 && m.height > 0, 'MEDIA_BACKEND_OUTPUT_INVALID');
  const height = m.pageHeight ?? m.height;
  need(Number.isInteger(height) && height > 0, 'MEDIA_BACKEND_OUTPUT_INVALID');
  const swapped = [5,6,7,8].includes(m.orientation);
  return { mediaKind: 'image', container: signature, durationSeconds: null, bitrate: null, hasAudio: false, streams: [],
    image: { dimensions: dimensions(m.width, height), displayDimensions: dimensions(swapped ? height : m.width, swapped ? m.width : height),
      exifOrientation: m.orientation ?? null, hasAlphaChannel: typeof m.hasAlpha === 'boolean' ? m.hasAlpha : null,
      colorSpace: typeof m.space === 'string' && /^[a-z0-9-]{1,30}$/i.test(m.space) ? m.space : null,
      channels: Number.isInteger(m.channels) ? m.channels : null, pages: Number.isInteger(m.pages) ? m.pages : 1 },
    backend: { id: 'sharp-metadata', version: sharp.versions?.sharp ?? null } };
}

export function probeWave(b) {
  need(b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE', 'MEDIA_FORMAT_UNSUPPORTED');
  const end = b.readUInt32LE(4) + 8; need(end === b.length);
  let fmt, dataSize = 0, dataFound = false, chunks = 0, pos = 12;
  while (pos < end) {
    need(++chunks <= 4096 && pos + 8 <= end); const id = b.toString('latin1', pos, pos + 4), size = b.readUInt32LE(pos + 4), start = pos + 8;
    need(start + size <= end);
    if (id === 'fmt ') {
      need(!fmt && size >= 16); const tag = b.readUInt16LE(start), channels = b.readUInt16LE(start + 2), sampleRate = b.readUInt32LE(start + 4), byteRate = b.readUInt32LE(start + 8), blockAlign = b.readUInt16LE(start + 12), bits = b.readUInt16LE(start + 14);
      need([1,3].includes(tag), 'MEDIA_FORMAT_UNSUPPORTED');
      need(channels > 0 && sampleRate > 0 && [8,16,24,32,64].includes(bits) && (tag !== 3 || [32,64].includes(bits)) && blockAlign === channels * bits / 8 && byteRate === sampleRate * blockAlign);
      fmt = { channels, sampleRate, byteRate, blockAlign, bits, codec: tag === 1 ? 'pcm' : 'ieee_float' };
    }
    if (id === 'data') { dataFound = true; dataSize += size; }
    pos = start + size + size % 2; need(pos <= end);
  }
  need(fmt && dataFound && dataSize % fmt.blockAlign === 0);
  const durationSeconds = dataSize / fmt.byteRate;
  return { mediaKind: 'audio', container: 'wav', durationSeconds, bitrate: { value: fmt.byteRate * 8, basis: 'uncompressed_sample_format', estimated: false }, image: null, hasAudio: true,
    streams: [{ index: 0, type: 'audio', codec: fmt.codec, durationSeconds, sampleRate: fmt.sampleRate, channels: fmt.channels, channelLayout: null, bitsPerSample: fmt.bits, bitrate: fmt.byteRate * 8 }],
    backend: { id: 'node-riff-wave-header', version: 1 } };
}

export function probeIsoBmff(b) {
  let budget = 20000;
  function boxes(start, end) {
    const result = [];
    while (start < end) {
      need(--budget >= 0 && start + 8 <= end); let size = b.readUInt32BE(start), head = 8;
      const type = b.toString('latin1', start + 4, start + 8); need(/^[\x20-\x7e]{4}$/.test(type));
      if (size === 1) { need(start + 16 <= end); const wide = b.readBigUInt64BE(start + 8); need(wide <= BigInt(Number.MAX_SAFE_INTEGER)); size = Number(wide); head = 16; }
      if (size === 0) size = end - start;
      need(size >= head && start + size <= end); result.push({ type, start: start + head, end: start + size }); start += size;
    }
    return result;
  }
  function one(items, type, required = true) { const matches = items.filter(v => v.type === type); need(matches.length <= 1 && (!required || matches.length === 1)); return matches[0]; }
  function payload(box, length) { need(box && box.start + length <= box.end); return b.subarray(box.start, box.end); }
  function clock(box) {
    const p = payload(box, 20), v = p[0]; need(v === 0 || v === 1); need(p.length >= (v === 1 ? 32 : 20));
    const scale = p.readUInt32BE(v === 1 ? 20 : 12), ticks = v === 1 ? p.readBigUInt64BE(24) : BigInt(p.readUInt32BE(16));
    need(scale > 0); return { scale, duration: ticks > BigInt(Number.MAX_SAFE_INTEGER) || ticks === (v === 1 ? 0xffffffffffffffffn : 0xffffffffn) ? null : finite(Number(ticks) / scale) };
  }
  const top = boxes(0, b.length), ftyp = one(top, 'ftyp'), moov = one(top, 'moov');
  const brand = payload(ftyp, 8).toString('latin1', 0, 4); need(['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','M4V ','M4A ','qt  '].includes(brand), 'MEDIA_FORMAT_UNSUPPORTED');
  need(!top.some(v => v.type === 'moof'), 'MEDIA_FORMAT_UNSUPPORTED'); need(top.some(v => v.type === 'mdat'));
  const movie = boxes(moov.start, moov.end); need(!movie.some(v => v.type === 'mvex'), 'MEDIA_FORMAT_UNSUPPORTED');
  const movieClock = clock(one(movie, 'mvhd')), tracks = movie.filter(v => v.type === 'trak'); need(tracks.length > 0 && tracks.length <= 128);
  const streams = tracks.map((track, index) => {
    const ts = boxes(track.start, track.end), tkhd = one(ts, 'tkhd'), mdia = one(ts, 'mdia'), md = boxes(mdia.start, mdia.end);
    const mediaClock = clock(one(md, 'mdhd')), h = payload(one(md, 'hdlr'), 12), handler = h.toString('latin1', 8, 12);
    if (!['vide','soun'].includes(handler)) return { index, type: 'other', codec: null, durationSeconds: mediaClock.duration };
    const minf = one(md, 'minf'), stbl = one(boxes(minf.start, minf.end), 'stbl'), tables = boxes(stbl.start, stbl.end), sd = one(tables, 'stsd');
    const sdp = payload(sd, 8); need(sdp[0] === 0); const samples = boxes(sd.start + 8, sd.end); need(samples.length === sdp.readUInt32BE(4) && samples.length === 1, 'MEDIA_FORMAT_UNSUPPORTED');
    const sample = samples[0], p = payload(sample, handler === 'vide' ? 78 : 28);
    const base = { index, type: handler === 'vide' ? 'video' : 'audio', codec: sample.type, durationSeconds: mediaClock.duration, bitrate: null };
    if (handler === 'soun') {
      need(p.readUInt16BE(8) === 0, 'MEDIA_FORMAT_UNSUPPORTED');
      return { ...base, channels: p.readUInt16BE(16) || null, sampleRate: p.readUInt32BE(24) / 65536 || null, channelLayout: null };
    }
    const width = p.readUInt16BE(24), height = p.readUInt16BE(26), visualChildren = boxes(sample.start + 78, sample.end), pasp = one(visualChildren, 'pasp', false);
    const pixelAspectRatio = pasp ? (() => { const a = payload(pasp, 8); return ratio(a.readUInt32BE(0), a.readUInt32BE(4)); })() : null;
    const tk = payload(tkhd, 84); need(tk[0] === 0 || tk[0] === 1); const matrixOffset = tk[0] === 1 ? 52 : 40; need(tk.length >= matrixOffset + 44);
    const matrix = [0,4,12,16].map(o => tk.readInt32BE(matrixOffset + o)), rotationValues = [[65536,0,0,65536],[0,65536,-65536,0],[-65536,0,0,-65536],[0,-65536,65536,0]];
    const affine = tk.readInt32BE(matrixOffset + 8) === 0 && tk.readInt32BE(matrixOffset + 20) === 0 && tk.readInt32BE(matrixOffset + 32) === 1073741824;
    const rotationIndex = affine ? rotationValues.findIndex(v => v.every((x, i) => matrix[i] === x)) : -1, rotationDegrees = rotationIndex < 0 ? null : rotationIndex * 90;
    const stts = one(tables, 'stts', false); let frameRate = null, timing = null, frameCount = null;
    if (stts) {
      const timingData = payload(stts, 8), count = timingData.readUInt32BE(4); need(timingData[0] === 0 && count <= 1000000 && timingData.length === 8 + count * 8);
      let sampleCount = 0, ticks = 0, prior, variable = false;
      for (let i = 0; i < count; i++) {
        const n = timingData.readUInt32BE(8 + i * 8), delta = timingData.readUInt32BE(12 + i * 8); need(n > 0 && delta > 0);
        sampleCount += n; ticks += n * delta; need(Number.isSafeInteger(sampleCount) && Number.isSafeInteger(ticks));
        variable ||= prior !== undefined && prior !== delta; prior = delta;
      }
      need(Number.isSafeInteger(sampleCount * mediaClock.scale)); frameRate = ratio(sampleCount * mediaClock.scale, ticks); timing = variable ? 'variable_sample_deltas' : 'uniform_sample_deltas'; frameCount = sampleCount;
    }
    const swapped = [90,270].includes(rotationDegrees);
    return { ...base, dimensions: dimensions(width, height), displayDimensions: rotationDegrees === null ? null : dimensions(swapped ? height : width, swapped ? width : height),
      pixelAspectRatio, displayAspectRatio: pixelAspectRatio && rotationDegrees !== null ? swapped ? ratio(height * pixelAspectRatio.denominator, width * pixelAspectRatio.numerator) : ratio(width * pixelAspectRatio.numerator, height * pixelAspectRatio.denominator) : null,
      displayAspectRatioBasis: 'coded_dimensions_and_declared_pixel_aspect_after_rotation', rotationDegrees, frameCount, frameRate, frameRateBasis: 'sample_timing_table_average', timing };
  });
  need(streams.some(s => ['audio','video'].includes(s.type)), 'MEDIA_FORMAT_UNSUPPORTED');
  const durationSeconds = movieClock.duration;
  return { mediaKind: streams.some(s => s.type === 'video') ? 'video' : 'audio', container: brand === 'qt  ' ? 'mov' : 'mp4',
    durationSeconds, bitrate: durationSeconds > 0 ? { value: b.length * 8 / durationSeconds, basis: 'file_size_over_movie_header_duration', estimated: true } : null,
    image: null, hasAudio: streams.some(s => s.type === 'audio'), streams, backend: { id: 'node-iso-bmff-header', version: 1 } };
}

export async function probeMediaBytes(bytes, declaredKind, loadSharp) {
  try {
    if (declaredKind === 'image') return await probeImage(bytes, loadSharp);
    if (bytes.toString('latin1', 0, 4) === 'RIFF') return probeWave(bytes);
    need(bytes.length >= 8 && bytes.toString('latin1', 4, 8) === 'ftyp', 'MEDIA_FORMAT_UNSUPPORTED');
    return probeIsoBmff(bytes);
  } catch (error) { throw Object.assign(new Error('Media header inspection failed'), { inspectionCode: error.inspectionCode || 'MEDIA_UNREADABLE' }); }
}
