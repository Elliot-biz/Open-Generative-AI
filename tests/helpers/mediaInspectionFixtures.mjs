// Tiny generated technical-header fixtures, not evidence of encoded-video decodability.
import sharp from 'sharp';
export const imageBytes = (width = 4, height = 2, format = 'png') => sharp({ create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } }).toFormat(format).toBuffer();
export function waveBytes() {
  const b = Buffer.alloc(44 + 16000); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(16000, 40); return b;
}
export function box(type, ...parts) { const payload = Buffer.concat(parts), h = Buffer.alloc(8); h.writeUInt32BE(payload.length + 8); h.write(type, 4, 'latin1'); return Buffer.concat([h, payload]); }
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const clock = () => { const b = Buffer.alloc(24); b.writeUInt32BE(1000, 12); b.writeUInt32BE(1000, 16); return b; };
export function movieBytes({ audio = true, rotation = 0, variable = false, duplicateVideo = false, brand = 'mp42', pasp = true } = {}) {
  const track = (video, id) => {
    const tk = Buffer.alloc(84); tk.writeUInt32BE(id, 12); tk.writeUInt32BE(1000, 20);
    const matrix = rotation === 90 ? [0,65536,-65536,0] : rotation === 180 ? [-65536,0,0,-65536] : [65536,0,0,65536];
    [0,4,12,16].forEach((o,i) => tk.writeInt32BE(matrix[i], 40 + o)); tk.writeInt32BE(1073741824, 72); tk.writeUInt32BE((video ? 320 : 0) * 65536, 76); tk.writeUInt32BE((video ? 180 : 0) * 65536, 80);
    const handler = Buffer.alloc(12); handler.write(video ? 'vide' : 'soun', 8);
    const sample = Buffer.alloc(video ? 78 : 28); sample.writeUInt16BE(1, 6);
    if (video) { sample.writeUInt16BE(320, 24); sample.writeUInt16BE(180, 26); }
    else { sample.writeUInt16BE(2, 16); sample.writeUInt16BE(16, 18); sample.writeUInt32BE(48000 * 65536, 24); }
    const entry = box(video ? 'avc1' : 'mp4a', sample, ...(video && pasp ? [box('pasp', u32(1), u32(1))] : []));
    const times = variable ? [u32(10), u32(20), u32(20), u32(40)] : [u32(25), u32(40)];
    const stbl = box('stbl', box('stsd', Buffer.alloc(4), u32(1), entry), box('stts', Buffer.alloc(4), u32(variable ? 2 : 1), ...times));
    return box('trak', box('tkhd', tk), box('mdia', box('mdhd', clock()), box('hdlr', handler), box('minf', stbl)));
  };
  return Buffer.concat([box('ftyp', Buffer.from(brand), Buffer.alloc(4), Buffer.from('isom')), box('moov', box('mvhd', clock()), track(true, 1), ...(audio ? [track(false, 2)] : []), ...(duplicateVideo ? [track(true, 3)] : [])), box('mdat', Buffer.from([0,1,2,3]))]);
}
