// Runs only in the isolated, network-denied utility renderer. No preload or Node access.
import { FaceLandmarker, FilesetResolver } from './vision_bundle.mjs';
export async function extract({timeline}) {
  const model=new Uint8Array(await (await fetch('whihm-face://runtime/model.task')).arrayBuffer());
  const files=await FilesetResolver.forVisionTasks('whihm-face://runtime/wasm');
  const task=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:0.5,minFacePresenceConfidence:0.5,minTrackingConfidence:0.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
  const frames=[];
  try {
    for(let index=0;index<timeline.frameCount;index++){
      const blob=await (await fetch(`whihm-face://runtime/frame/${index}`)).blob(),bitmap=await createImageBitmap(blob);
      try {
        if(bitmap.width!==timeline.width||bitmap.height!==timeline.height)throw Error('FACE_FRAME_DIMENSIONS_INVALID');
        const result=task.detectForVideo(bitmap,timeline.timestampsMs[index]);
        if(result.faceLandmarks.length>1)throw Error('FACE_MULTIPLE_FACES_UNSUPPORTED');
        frames.push({index,timestampMs:timeline.timestampsMs[index],landmarks:(result.faceLandmarks[0]??[]).map(({x,y,z})=>({x,y,z}))});
      } finally {bitmap.close();}
    }
    return {frames,connections:FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(({start,end})=>[start,end])};
  } finally {task.close();}
}
