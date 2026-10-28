// Canonical frame-grid editing semantics. No filesystem, process or provider access.
import { stableJSON } from '../../packages/whihm-workflow-core/src/diff.js';
import { fields, safeData, validId, validHash, hashBytes } from '../../packages/whihm-workflow-core/src/project/io.js';

export const timelineLimits = Object.freeze({ tracks: 8, items: 32, seconds: 600, pixels: 8294400, axis: 4096, sourceBytes: 67108864 });
export const timelineNeed = (value, code) => { if (!value) throw Object.assign(new Error(code), { timelineCode: code }); };
const need = timelineNeed;
const integer = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const dimension = n => integer(n, 2, timelineLimits.axis) && n % 2 === 0;
const gcd = (a,b) => b ? gcd(b,a%b) : a;
export const timelineHash = value => hashBytes(Buffer.from(stableJSON(value)));
export const frameSeconds = (frames, rate) => frames * rate.denominator / rate.numerator;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;

export function normalizeTimeline(input) {
  safeData(input, 'TIMELINE_INVALID');
  need(Buffer.byteLength(JSON.stringify(input)) <= 131072, 'TIMELINE_LIMIT');
  fields(input, ['schemaVersion','timelineId','canvas','frameRate','audio','render','tracks'], ['name','metadata','durationFrames'], 'TIMELINE_FIELDS_INVALID');
  need(input.schemaVersion === 1, 'TIMELINE_VERSION_UNSUPPORTED');
  need(validId(input.timelineId) && input.timelineId.length <= 128, 'TIMELINE_ID_INVALID');
  need(input.name === undefined || typeof input.name === 'string' && input.name.length <= 256, 'TIMELINE_NAME_INVALID');
  fields(input.canvas, ['width','height'], [], 'TIMELINE_CANVAS_INVALID');
  need(dimension(input.canvas.width) && dimension(input.canvas.height) && input.canvas.width*input.canvas.height <= timelineLimits.pixels, 'TIMELINE_CANVAS_INVALID');
  fields(input.frameRate, ['numerator','denominator'], [], 'TIMELINE_RATE_INVALID');
  const {numerator,denominator}=normalizeTimelineRate(input.frameRate);
  const rate={numerator,denominator}, maxFrames=Math.floor(timelineLimits.seconds*numerator/denominator);
  fields(input.audio,['policy'],['sampleRate','channels','bitrate'],'TIMELINE_AUDIO_INVALID');
  need(['none','mix'].includes(input.audio.policy),'TIMELINE_AUDIO_INVALID');
  if(input.audio.policy==='mix')need([44100,48000].includes(input.audio.sampleRate)&&[1,2].includes(input.audio.channels)&&integer(input.audio.bitrate,32000,320000),'TIMELINE_AUDIO_INVALID');
  else need(Object.keys(input.audio).length===1,'TIMELINE_AUDIO_INVALID');
  fields(input.render,['container','videoCodec','videoBitrate'],[],'TIMELINE_RENDER_INVALID');
  need(input.render.container==='mp4'&&input.render.videoCodec==='h264'&&integer(input.render.videoBitrate,100000,50000000),'TIMELINE_RENDER_INVALID');
  need(Array.isArray(input.tracks)&&input.tracks.length>0&&input.tracks.length<=timelineLimits.tracks,'TIMELINE_TRACKS_INVALID');
  const ids=new Set(), orders=new Set();let count=0,end=0;
  function id(value){need(validId(value)&&!['__proto__','prototype','constructor'].includes(value)&&value.length<=128&&!ids.has(value),'TIMELINE_DUPLICATE_OR_INVALID_ID');ids.add(value);}
  const tracks=input.tracks.map(track=>{
    fields(track,['id','type','order','items'],['enabled'],'TIMELINE_TRACK_INVALID');id(track.id);
    need(['video','audio','overlay'].includes(track.type),'TIMELINE_TRACK_UNSUPPORTED');
    need(integer(track.order,0,255)&&!orders.has(track.order),'TIMELINE_ORDER_INVALID');orders.add(track.order);
    need(track.enabled===undefined||typeof track.enabled==='boolean','TIMELINE_TRACK_INVALID');
    need(Array.isArray(track.items),'TIMELINE_ITEMS_INVALID');
    const items=track.items.map(item=>{
      need(++count<=timelineLimits.items,'TIMELINE_LIMIT');
      fields(item,['id','type','source','startFrame','durationFrames'],['sourceInFrame','placement','sourceAudio','gainDb','transition'],'TIMELINE_ITEM_INVALID');id(item.id);
      need(track.type==='video'?item.type==='video':track.type==='audio'?item.type==='audio':['image','video'].includes(item.type),'TIMELINE_ITEM_TYPE_INVALID');
      fields(item.source,['assetId','checksum'],[],'TIMELINE_SOURCE_INVALID');
      need(validId(item.source.assetId)&&validHash(item.source.checksum),'TIMELINE_SOURCE_INVALID');
      need(integer(item.startFrame,0,maxFrames)&&integer(item.durationFrames,1,maxFrames)&&item.startFrame+item.durationFrames<=maxFrames,'TIMELINE_TIME_INVALID');
      need(item.transition===undefined||item.transition==='cut','TIMELINE_TRANSITION_UNSUPPORTED');
      const sourceInFrame=item.sourceInFrame??0;
      need(integer(sourceInFrame,0,maxFrames)&&(item.type!=='image'||sourceInFrame===0),'TIMELINE_TIME_INVALID');
      need(item.type!=='video'||['ignore','use'].includes(item.sourceAudio),'TIMELINE_SOURCE_AUDIO_REQUIRED');
      need(item.type==='video'||item.sourceAudio===undefined,'TIMELINE_AUDIO_INVALID');
      need(input.audio.policy==='mix'||item.type!=='audio'&&item.sourceAudio!=='use','TIMELINE_AUDIO_DISABLED');
      need(item.gainDb===undefined||(item.type==='audio'||item.sourceAudio==='use')&&typeof item.gainDb==='number'&&Number.isFinite(item.gainDb)&&item.gainDb>=-60&&item.gainDb<=12,'TIMELINE_GAIN_INVALID');
      let placement;
      if(item.type!=='audio'){
        placement=item.placement??{x:0,y:0,...input.canvas};
        fields(placement,['x','y','width','height'],[],'TIMELINE_PLACEMENT_INVALID');
        need(integer(placement.x,0,input.canvas.width)&&integer(placement.y,0,input.canvas.height)&&dimension(placement.width)&&dimension(placement.height)&&placement.x+placement.width<=input.canvas.width&&placement.y+placement.height<=input.canvas.height,'TIMELINE_PLACEMENT_INVALID');
      }else need(item.placement===undefined,'TIMELINE_PLACEMENT_INVALID');
      end=Math.max(end,item.startFrame+item.durationFrames);
      return {id:item.id,type:item.type,source:structuredClone(item.source),startFrame:item.startFrame,durationFrames:item.durationFrames,sourceInFrame,transition:'cut',...(placement?{placement:structuredClone(placement)}:{}),...(item.type==='video'?{sourceAudio:item.sourceAudio}:{}),...(item.type==='audio'||item.sourceAudio==='use'?{gainDb:item.gainDb??0}:{})};
    }).sort((a,b)=>a.startFrame-b.startFrame||compare(a.id,b.id));
    if(track.type!=='audio')for(let i=1;i<items.length;i++)need(items[i-1].startFrame+items[i-1].durationFrames<=items[i].startFrame,'TIMELINE_SAME_TRACK_OVERLAP');
    return {id:track.id,type:track.type,order:track.order,enabled:track.enabled??true,items};
  }).sort((a,b)=>a.order-b.order);
  need(count>0&&end>0,'TIMELINE_EMPTY');
  const durationFrames=input.durationFrames??end;
  need(integer(durationFrames,end,maxFrames),'TIMELINE_DURATION_INVALID');
  return {schemaVersion:1,timelineId:input.timelineId,canvas:structuredClone(input.canvas),frameRate:rate,durationFrames,audio:structuredClone(input.audio),render:structuredClone(input.render),tracks};
}

// Labels/IDs remain in lineage, but do not invalidate identical rendered semantics.
export function timelineRenderIdentity(timeline) {
  return {...timeline,timelineId:undefined,tracks:timeline.tracks.filter(t=>t.enabled).map(({type,order,items})=>({type,order,items:items.map(({id:_id,...item})=>item)}))};
}
export function hashTimeline(timeline) {const identity=timelineRenderIdentity(timeline);delete identity.timelineId;return timelineHash(identity);}

export function timelineReadiness(status, requiredFeatures) {
  const blockingReasons=[...(status.blockingReasons??[])];
  for(const id of requiredFeatures)if(status.baseline?.features.find(f=>f.id===id)?.status!=='available')blockingReasons.push({code:'TIMELINE_FEATURE_UNAVAILABLE',feature:id});
  return {executable:status.availability==='ready'&&blockingReasons.length===0,blockingCode:'TIMELINE_RUNTIME_NOT_READY',blockingReasons,requiresFreshRuntimeCheck:true};
}

export function normalizeTimelineRate(frameRate){
  fields(frameRate,['numerator','denominator'],[],'TIMELINE_RATE_INVALID');
  let {numerator,denominator} = frameRate;
  need(integer(numerator,1,60000) && integer(denominator,1,1001) && numerator/denominator >= 1 && numerator/denominator <= 60, 'TIMELINE_RATE_INVALID');
  const divisor=gcd(numerator,denominator);numerator/=divisor;denominator/=divisor;
  return {numerator,denominator};
}
export const timelineSample=(frames,rate,sampleRate)=>Math.round(frames*rate.denominator*sampleRate/rate.numerator);
