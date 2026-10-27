// Fixed, ephemeral CPU/WASM utility. No application IPC/preload, credentials, file access or network.
const {randomUUID}=require('node:crypto');
function registerFaceScheme(protocol){protocol.registerSchemesAsPrivileged([{scheme:'whihm-face',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);}
function createFaceRenderer({BrowserWindow,session,timeoutMs=120000}) {
    return async ({frames,timeline,assets})=>{
        const partition=`whihm-face-${randomUUID()}`,isolated=session.fromPartition(partition,{cache:false});let window,timer;
        const files=new Map(Object.entries(assets.files));
        frames.forEach((bytes,i)=>files.set(`frame/${i}`,bytes));
        files.set('index.html',Buffer.from('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src whihm-face: \'wasm-unsafe-eval\'; connect-src whihm-face:; img-src blob: whihm-face:"></head><body></body></html>'));
        const approved=url=>{try{const u=new URL(url);return u.protocol==='whihm-face:'&&u.hostname==='runtime'&&!u.search&&!u.hash&&files.has(u.pathname.slice(1));}catch{return false;}};
        isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!approved(details.url)}));
        isolated.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
        isolated.protocol.handle('whihm-face',request=>{
            if(!approved(request.url))return new Response(null,{status:403});
            const name=new URL(request.url).pathname.slice(1),type=name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')||name.endsWith('.mjs')?'text/javascript':name==='index.html'?'text/html':name.startsWith('frame/')?'image/png':'application/octet-stream';
            return new Response(files.get(name),{headers:{'Content-Type':type,'Access-Control-Allow-Origin':'whihm-face://runtime'}});
        });
        try {
            window=new BrowserWindow({show:false,width:1,height:1,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
            window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
            return await Promise.race([(async()=>{await window.loadURL('whihm-face://runtime/index.html');return window.webContents.executeJavaScript(`import('whihm-face://runtime/runner.mjs').then(m=>m.extract(${JSON.stringify({timeline})}))`);})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Face runner timed out'),{guidanceCode:'FACE_RUNNER_TIMEOUT'})),timeoutMs);})]);
        }catch(error){throw Object.assign(new Error('Face runner failed'),{guidanceCode:error.guidanceCode??'FACE_RUNNER_FAILED'});}
        finally{clearTimeout(timer);if(window&&!window.isDestroyed())window.destroy();isolated.protocol.unhandle('whihm-face');isolated.webRequest.onBeforeRequest(null);files.clear();}
    };
}
module.exports={registerFaceScheme,createFaceRenderer};
