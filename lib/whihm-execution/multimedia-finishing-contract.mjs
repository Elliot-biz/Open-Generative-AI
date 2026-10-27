// Authoritative bounded multimedia operations. No caller command/filter syntax.
import { fields } from '../../packages/whihm-workflow-core/src/project/io.js';

export const videoWriterSettings=Object.freeze({encoder:'libx264',preset:'medium',pixelFormat:'yuv420p',defaultCrf:23,defaultAudioBitrate:128000});
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const choice = values => ({ type: 'string', enum: values });
export const multimediaSpecs = {
  sourceAudioAssetId:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_.:-]*$'}, container: choice(['mp4','mov','wav']), videoCodec: choice(['h264']), audioCodec: choice(['aac','pcm_s16le']),
  audio: choice(['preserve','remove']), width: integer(2,8192), height: integer(2,8192),
  left: integer(0,8192), top: integer(0,8192), background: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  start: number(0,86400), duration: number(0.000001,86400), end: number(0.000001,86400),
  fps: number(1,120), videoBitrate: integer(10000,100000000), audioBitrate: integer(16000,320000),
  seconds: number(0,86400), gainDb: number(-60,24), sampleRate: { type:'integer', enum:[8000,16000,22050,24000,32000,44100,48000] }, channels: { type:'integer', enum:[1,2] },
};
export const multimediaOperations = {
  video: {
    restore_source_audio: {required:['sourceAudioAssetId'],allowed:['sourceAudioAssetId']},
    trim: { required:['start'], allowed:['start','duration','end'] },
    resize: { required:['width','height'], allowed:['width','height'] },
    crop: { required:['left','top','width','height'], allowed:['left','top','width','height'] },
    contain: { required:['width','height','background'], allowed:['width','height','background'] },
    fps: { required:['fps'], allowed:['fps'] }, transcode: { required:[], allowed:[] },
  },
  audio: {
    trim: { required:['start'], allowed:['start','duration','end'] },
    fade_in: { required:['seconds'], allowed:['seconds'] }, fade_out: { required:['seconds'], allowed:['seconds'] },
    gain: { required:['gainDb'], allowed:['gainDb'] },
    resample: { required:['sampleRate'], allowed:['sampleRate'] }, channels: { required:['channels'], allowed:['channels'] },
    convert: { required:[], allowed:[] },
  },
};
export const multimediaExportFields = {
  video: { required:['container','videoCodec','audio'], optional:['videoBitrate','audioCodec','audioBitrate'] },
  audio: { required:['container','audioCodec'], optional:['sampleRate','channels'] },
};
export function getMultimediaParameterSpecs(kind) {
  const common=multimediaExportFields[kind], rules=multimediaOperations[kind];
  const keys=new Set([...common.required,...common.optional,...Object.values(rules).flatMap(rule=>rule.allowed)]);
  return {...Object.fromEntries([...keys].sort().map(key=>[key,multimediaSpecs[key]])),
    container:choice(kind==='video'?['mp4','mov']:['wav']),audioCodec:choice(kind==='video'?['aac']:['pcm_s16le'])};
}
export const multimediaLimitations = [
  'Video: one H.264 avc1 stream, optional single AAC mp4a stream, MP4/MOV only; declared square pixels and zero rotation required. Audio: one PCM16 WAV or AAC MP4/MOV stream, mono/stereo, supported declared sample rate. Other streams/encodings reject.',
  'Video transforms re-encode H.264 software/libx264 and any preserved audio as AAC. restore_source_audio instead copies the selected video stream and encodes its explicit donor soundtrack as AAC. Audio preservation retains content/technical rate and channels, not bitstream identity. Caller selects container/codecs/audio policy; encoder technical default CRF23/preset medium, AAC128000 bps unless explicit bitrate.',
  'Image Sharp remains independent. Video/audio require a fresh WHIHM_MEDIA_FINISHING_BASELINE_V1 ready lease; a planning observation, including ready, never authorizes execution.',
  'FPS uses deterministic frame duplication/drop, not interpolation. Coordinates use unrotated square display pixels; video output geometry and crop origins must be even for yuv420p. Contain centres content, rounding scaled dimensions down to even pixels.',
  'Header verification is technical metadata evidence, not decoded playback, sample identity, perceived quality or exact editorial timing. Video duration tolerance is one frame plus one AAC packet (1024/sampleRate when audio exists), audio one sample. FPS tolerance 0.0001 fps; no cross-version/platform byte-identity guarantee.',
  'Time controls normalize to the nearest microsecond, at most 0.5 microsecond rounding; effective values appear in plans. Positive values rounded to zero and sub-frame/sub-sample output durations reject.',
  'One operation per request; no named delivery presets, multi-track mixing, optional codecs, hardware encoding, max-size targeting or loudness normalization. Existing project byte limits apply; no provider transport.',
];
const fail = code => { throw Object.assign(new Error(code), { finishingCode: code }); };
const need = (value, code = 'FINISH_PARAMETERS_INVALID') => { if (!value) fail(code); };
const sorted = object => Object.fromEntries(Object.entries(object).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
const seconds = value => Math.round(value*1000000)/1000000;
function valid(value,spec) {
  if(spec.enum)return spec.enum.includes(value);
  if(spec.type==='string')return typeof value==='string'&&new RegExp(spec.pattern).test(value);
  return typeof value==='number'&&Number.isFinite(value)&&(spec.type!=='integer'||Number.isSafeInteger(value))&&value>=spec.minimum&&value<=spec.maximum;
}
export function prepareMultimediaOperation(kind, operation, parameters, facts) {
  need(Object.hasOwn(multimediaOperations,kind), 'FINISH_MEDIA_KIND_UNSUPPORTED');
  need(typeof operation==='string'&&Object.hasOwn(multimediaOperations[kind],operation), 'FINISH_OPERATION_UNSUPPORTED');
  const rule=multimediaOperations[kind][operation], exports=multimediaExportFields[kind];
  fields(parameters,[...exports.required,...rule.required],[...exports.optional,...rule.allowed.filter(k=>!rule.required.includes(k))], 'FINISH_PARAMETERS_INVALID');
  const properties=getMultimediaParameterSpecs(kind);
  for(const [key,value] of Object.entries(parameters))need(Object.hasOwn(properties,key)&&valid(value,properties[key]));
  const p={...parameters}, videos=facts.streams.filter(s=>s.type==='video'), audios=facts.streams.filter(s=>s.type==='audio');
  // FFmpeg duration options use microseconds. Plans expose the effective rounded values.
  for(const key of ['start','duration','end','seconds'])if(p[key]!==undefined){
    const rounded=seconds(p[key]);need(p[key]===0||rounded>0);p[key]=rounded;
  }
  need(facts.durationSeconds>0&&facts.durationSeconds<=86400,'FINISH_SOURCE_DURATION_UNSUPPORTED');
  need(facts.streams.length===videos.length+audios.length&&audios.length<=1,'FINISH_SOURCE_STREAMS_UNSUPPORTED');
  const a=audios[0], v=videos[0];
  if(operation==='restore_source_audio')need(kind==='video'&&p.audio==='preserve'&&a,'FINISH_AUDIO_RESTORE_INVALID');
  if(a)need(multimediaSpecs.sampleRate.enum.includes(a.sampleRate)&&[1,2].includes(a.channels)&&
    ((a.codec==='pcm'&&a.bitsPerSample===16&&facts.container==='wav')||(a.codec==='mp4a'&&['mp4','mov'].includes(facts.container))), 'FINISH_SOURCE_AUDIO_UNSUPPORTED');
  let expected={mediaKind:kind,container:p.container,durationSeconds:facts.durationSeconds};
  if(kind==='video') {
    need(videos.length===1&&v.codec==='avc1'&&['mp4','mov'].includes(facts.container),'FINISH_SOURCE_VIDEO_UNSUPPORTED');
    need(v.rotationDegrees===0&&v.pixelAspectRatio?.value===1&&v.frameRate?.value>=1&&v.frameRate.value<=120&&v.timing==='uniform_sample_deltas','FINISH_SOURCE_GEOMETRY_UNSUPPORTED');
    need(p.audio==='preserve'||(p.audioCodec===undefined&&p.audioBitrate===undefined));
    need(p.audio!=='preserve'||a||p.audioCodec===undefined&&p.audioBitrate===undefined);
    if(p.audio==='preserve'&&a){need(p.audioCodec==='aac');p.audioBitrate??=videoWriterSettings.defaultAudioBitrate;}
    const original=v.displayDimensions;
    need(original.width<=8192&&original.height<=8192&&original.width*original.height<=16777216,'FINISH_PIXEL_LIMIT');
    const size=['resize','crop','contain'].includes(operation)?{width:p.width,height:p.height}:{width:original.width,height:original.height};
    need(size.width%2===0&&size.height%2===0&&size.width*size.height<=16777216,'FINISH_VIDEO_DIMENSIONS_INVALID');
    if(operation==='crop')need(p.left%2===0&&p.top%2===0&&p.left+p.width<=original.width&&p.top+p.height<=original.height,'FINISH_CROP_OUT_OF_BOUNDS');
    if(operation==='contain') {
      const ratio=Math.min(p.width/original.width,p.height/original.height);
      need(Math.floor(original.width*ratio/2)*2>=2&&Math.floor(original.height*ratio/2)*2>=2,'FINISH_VIDEO_DIMENSIONS_INVALID');
      p.background=p.background.toLowerCase();
    }
    expected={...expected,...size,videoCodec:'avc1',fps:operation==='fps'?p.fps:v.frameRate.value,
      hasAudio:p.audio==='preserve'&&Boolean(a),audioCodec:p.audio==='preserve'&&a?'mp4a':null,
      sampleRate:p.audio==='preserve'&&a?a.sampleRate:null,channels:p.audio==='preserve'&&a?a.channels:null};
  } else {
    need(!videos.length&&audios.length===1,'FINISH_SOURCE_STREAMS_UNSUPPORTED');
    p.sampleRate??=a.sampleRate;p.channels??=a.channels;
    if(operation==='fade_in'||operation==='fade_out')need(p.seconds<=facts.durationSeconds&&(p.seconds===0||p.seconds>=1/a.sampleRate),'FINISH_FADE_OUT_OF_BOUNDS');
    expected={...expected,audioCodec:'pcm',bitsPerSample:16,sampleRate:p.sampleRate,channels:p.channels,hasAudio:true};
  }
  if(operation==='trim') {
    need((p.duration!==undefined)!==(p.end!==undefined),'FINISH_TRIM_INVALID');
    const duration=p.duration??seconds(p.end-p.start);
    need(duration>0&&p.start+duration<=facts.durationSeconds,'FINISH_TRIM_OUT_OF_BOUNDS');
    p.duration=duration;delete p.end;expected.durationSeconds=duration;
  }
  need(expected.durationSeconds>=(kind==='video'?1/expected.fps:1/expected.sampleRate),'FINISH_DURATION_UNREPRESENTABLE');
  return {parameters:sorted(p),expectedOutput:expected,encoding:kind==='video'?{encoder:videoWriterSettings.encoder,preset:videoWriterSettings.preset,pixelFormat:videoWriterSettings.pixelFormat,rateControl:p.videoBitrate?{bitrate:p.videoBitrate}:{crf:videoWriterSettings.defaultCrf},audio:expected.hasAudio?{encoder:'aac',bitrate:p.audioBitrate,sampleRate:expected.sampleRate,channels:expected.channels}:null}:{encoder:'pcm_s16le',bitsPerSample:16},verificationTolerance:{durationSeconds:kind==='video'?1/expected.fps+(expected.hasAudio?1024/expected.sampleRate:0):1/expected.sampleRate,frameRate:0.0001}};
}

// Paths come only from the private backend staging directory, never from requests.
export function buildMultimediaArguments(plan,input,output,audioInput) {
  const p=plan.parameters, kind=plan.expectedOutput.mediaKind, filters=[],audioFilters=[];
  const time=value=>seconds(value).toFixed(6); // avoid exponent notation in AV_OPT_TYPE_DURATION
  const args=['-hide_banner','-loglevel','error','-xerror','-nostdin','-n','-max_alloc','67108864','-threads','1','-filter_threads','1',
    '-protocol_whitelist','file','-noautorotate','-f',plan.sourceInspection.facts.container==='wav'?'wav':'mov',
    ...(plan.sourceInspection.facts.container==='wav'?[]:['-enable_drefs','0','-use_absolute_path','0']),'-i',input,'-map_metadata','-1','-map_chapters','-1'];
  if(plan.operation==='restore_source_audio') {
    const safeInput=['-protocol_whitelist','file',...(plan.audioSourceInspection.facts.container==='wav'?['-f','wav']:['-f','mov','-enable_drefs','0','-use_absolute_path','0']),'-i',audioInput];
    // Input options must precede global output metadata options.
    args.splice(args.indexOf('-map_metadata'),0,...safeInput);
    return [...args,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a',String(p.audioBitrate),'-ar',String(plan.expectedOutput.sampleRate),'-ac',String(plan.expectedOutput.channels),'-threads:a','1','-fs','67108865','-fflags','+bitexact','-f',p.container,output];
  }
  if(plan.operation==='trim') {
    if(kind==='video')filters.push(`trim=start=${time(p.start)}:duration=${time(p.duration)}`,'setpts=PTS-STARTPTS');
    audioFilters.push(`atrim=start=${time(p.start)}:duration=${time(p.duration)}`,'asetpts=PTS-STARTPTS');
  }
  if(kind==='video') {
    const d=plan.sourceInspection.facts.streams.find(s=>s.type==='video').displayDimensions;
    if(plan.operation==='resize')filters.push(`scale=${p.width}:${p.height}`);
    if(plan.operation==='crop')filters.push(`crop=${p.width}:${p.height}:${p.left}:${p.top}`);
    if(plan.operation==='contain') {
      const ratio=Math.min(p.width/d.width,p.height/d.height),w=Math.floor(d.width*ratio/2)*2,h=Math.floor(d.height*ratio/2)*2;
      // Even offsets avoid chroma alignment changing the requested canvas.
      filters.push(`scale=${w}:${h}`,`pad=${p.width}:${p.height}:${Math.floor((p.width-w)/4)*2}:${Math.floor((p.height-h)/4)*2}:color=0x${p.background.slice(1)}`);
    }
    if(plan.operation==='fps')filters.push(`fps=${p.fps}:round=near`);
    args.push('-map','0:v:0');
    if(filters.length)args.push('-vf',filters.join(','));
    args.push('-c:v','libx264','-threads:v','1','-preset',videoWriterSettings.preset,'-pix_fmt',videoWriterSettings.pixelFormat,'-fps_mode','passthrough','-aspect',`${plan.expectedOutput.width}:${plan.expectedOutput.height}`,'-metadata:s:v:0','rotate=0');
    args.push(...(p.videoBitrate?['-b:v',String(p.videoBitrate)]:['-crf',String(videoWriterSettings.defaultCrf)]));
    if(plan.expectedOutput.hasAudio)args.push('-map','0:a:0','-c:a','aac','-b:a',String(p.audioBitrate),'-ar',String(plan.expectedOutput.sampleRate),'-ac',String(plan.expectedOutput.channels));
    else args.push('-an');
  } else {
    args.push('-map','0:a:0','-vn','-c:a','pcm_s16le','-ar',String(p.sampleRate),'-ac',String(p.channels));
    if(plan.operation==='gain')audioFilters.push(`volume=${p.gainDb}dB`);
    if(['fade_in','fade_out'].includes(plan.operation)&&p.seconds>0)audioFilters.push(`afade=t=${plan.operation==='fade_in'?'in':'out'}:st=${time(plan.operation==='fade_in'?0:plan.expectedOutput.durationSeconds-p.seconds)}:d=${time(p.seconds)}`);
  }
  if(audioFilters.length&&plan.expectedOutput.hasAudio)args.push('-af',audioFilters.join(','));
  args.push('-threads:a','1','-t',time(plan.expectedOutput.durationSeconds),'-fs','67108865','-fflags','+bitexact','-f',p.container,output);
  return args;
}
export function verifyMultimediaOutput(plan, facts) {
  const expected=plan.expectedOutput,t=plan.verificationTolerance, videos=facts.streams.filter(s=>s.type==='video'),audios=facts.streams.filter(s=>s.type==='audio');
  const checks=['media_kind','container','duration','streams','audio_presence','codec','positive_file_size'];
  const near=(actual,target,tolerance)=>Number.isFinite(actual)&&Math.abs(actual-target)<=tolerance+1e-9;
  need(facts.mediaKind===expected.mediaKind&&facts.container===expected.container&&facts.fileSize>0&&facts.durationSeconds>0&&facts.hasAudio===expected.hasAudio&&near(facts.durationSeconds,expected.durationSeconds,t.durationSeconds),'FINISH_OUTPUT_VERIFICATION_FAILED');
  need(facts.streams.length===videos.length+audios.length&&audios.length===(expected.hasAudio?1:0)&&videos.length===(expected.mediaKind==='video'?1:0),'FINISH_OUTPUT_VERIFICATION_FAILED');
  if(videos.length) {
    const v=videos[0];checks.push('dimensions','orientation','frame_rate','square_pixels');
    need(v.codec===expected.videoCodec&&v.displayDimensions?.width===expected.width&&v.displayDimensions?.height===expected.height&&v.rotationDegrees===0&&v.pixelAspectRatio?.value===1&&near(v.frameRate?.value,expected.fps,t.frameRate),'FINISH_OUTPUT_VERIFICATION_FAILED');
    need(v.durationSeconds>0&&near(v.durationSeconds,expected.durationSeconds,t.durationSeconds),'FINISH_OUTPUT_VERIFICATION_FAILED');
    if(plan.operation==='fps')need(v.timing==='uniform_sample_deltas','FINISH_OUTPUT_VERIFICATION_FAILED');
  }
  if(audios.length) {
    const a=audios[0];checks.push('sample_rate','channels');
    need(a.durationSeconds>0&&a.codec===expected.audioCodec&&a.sampleRate===expected.sampleRate&&a.channels===expected.channels&&near(a.durationSeconds,expected.durationSeconds,t.durationSeconds)&&(!expected.bitsPerSample||a.bitsPerSample===expected.bitsPerSample),'FINISH_OUTPUT_VERIFICATION_FAILED');
  }
  return checks;
}
