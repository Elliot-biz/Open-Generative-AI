const { register: registerLoader } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const operations = ['getProviderCenter','getProviderStatus','testProviderReadiness','getProviderDependencies','setProviderCredential','removeProviderCredential','planCreativeRevision','runCreativeRevision','getCreativeRevision','continueCreativeRevision','planCreativeQc','evaluateCreativeQc','getCreativeQc','recordCreativeQcHumanAssessment','planAgentExecution','applyAgentPlan','runAgentExecution','getAgentExecution','continueAgentExecution','analyzeAudioTiming','planAudioProduction','produceAudioMix','planTimelineComposition','composeTimeline','planPerformanceGuidance','preparePerformanceGuidance','getPerformanceGuidance','reviewPerformanceGuidance','createPerformanceBenchmark','getPerformanceBenchmark','recordBenchmarkCandidate','recordBenchmarkEvaluation','comparePerformanceBenchmark','planWorkflowExecution','runWorkflow','getWorkflowRun','approveWorkflowCheckpoint','resumeWorkflow','invalidateWorkflowRun', 'getMultimediaRuntimeStatus', 'finishMedia', 'planMediaFinishing', 'inspectMedia', 'planMediaInspection', 'getPlanningOverview', 'getCapabilityContext', 'getExecutorContext', 'getCapabilityProjection', 'openProject', 'getWorkflow', 'getAsset', 'planNode', 'executeNode', 'assessWorkflowReadiness', 'applyWorkflowApproval', 'applyWorkflowInvalidation'];
const reject = code => ({ status: 'rejected', diagnostics: [{ code, path: '', message: code.replaceAll('_', ' ') }] });
let loaded;
function multimediaHostEnvironment(app, { resourcesPath = process.resourcesPath, platform = process.platform, arch = process.arch } = {}) {
    if (!app) return null;
    const paths = platform === 'win32' ? path.win32 : path.posix;
    return { packaged: app.isPackaged === true, resourcesPath, platform, arch, managedRoot: paths.join(app.getPath('userData'), 'multimedia') };
}
function loadHost() {
    if (!loaded) {
        registerLoader(pathToFileURL(path.join(__dirname, 'whihm-esm-loader.mjs')));
        loaded = Promise.all([import('../../lib/whihm-execution/host.mjs'), import('../../lib/whihm-execution/multimedia-runtime.mjs'), import('../../lib/whihm-execution/face-guidance-runtime.mjs')]).then(([host, runtime, face]) => {
            const { app } = require('electron');
            const environment = multimediaHostEnvironment(app);
            if (environment) {
                runtime.configureMultimediaRuntime(environment);
                face.configureFaceGuidanceRenderer(require('./face-guidance').createFaceRenderer(require('electron')));
            }
            return host;
        });
    }
    return loaded;
}

// Fixed IPC transport for existing clients, not a job service or polling loop.
function register({ ipcMain, getWindow, load = loadHost, timeoutMs = 35 * 60 * 1000, providerCredentials = null }) {
    const sessions = new Map();
    function trusted(event) {
        const window = getWindow();
        const expected = pathToFileURL(path.join(__dirname, '../../dist/index.html')).href;
        return window && !window.isDestroyed() && event.sender === window.webContents
            && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.split('#')[0] === expected;
    }
    function session(event) {
        const id = event.sender.id;
        if (sessions.has(id)) return sessions.get(id);
        const pending = new Map();
        const send = (channel, value) => { if (!event.sender.isDestroyed()) event.sender.send(channel, value); };
        const state = { pending, ready: false, host: null };
        state.host = Promise.resolve().then(load).then(({ createWorkflowHost }) => createWorkflowHost({ providerCredentials,
            emit: value => send('whihm:status', value),
            callRuntime(operation, payload) {
                if (!state.ready) return Promise.reject(Object.assign(new Error('Runtime not ready'), { hostCode: 'HOST_RUNTIME_NOT_READY' }));
                return new Promise((resolve, rejectPromise) => {
                    const requestId = randomUUID();
                    const timer = setTimeout(() => {
                        pending.delete(requestId);
                        rejectPromise(new Error('Runtime response timed out; job outcome unknown'));
                    }, timeoutMs);
                    pending.set(requestId, { resolve, reject: rejectPromise, timer });
                    send('whihm:runtime-request', { requestId, operation, payload });
                });
            },
        })).catch(() => null);
        const dispose = () => {
            for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Renderer disconnected')); }
            pending.clear(); state.ready = false;
            state.host.then(host => host?.dispose()).catch(() => {}); sessions.delete(id);
        };
        event.sender.once('destroyed', dispose);
        event.sender.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => { if (isMainFrame && !inPlace) dispose(); });
        sessions.set(id, state); return state;
    }
    ipcMain.handle('whihm:runtime-ready', event => {
        if (!trusted(event)) return reject('HOST_SENDER_REJECTED');
        session(event).ready = true; return { status: 'ready' };
    });
    for (const operation of operations) ipcMain.handle(`whihm:${operation}`, async (event, request) => {
        if (!trusted(event)) return reject('HOST_SENDER_REJECTED');
        try { return await (await session(event).host).invoke(operation, request); }
        catch { return reject('HOST_COMPONENTS_UNAVAILABLE'); }
    });
    ipcMain.handle('whihm:runtime-result', (event, response) => {
        if (!trusted(event)) return reject('HOST_SENDER_REJECTED');
        const state = sessions.get(event.sender.id), entry = state?.pending.get(response?.requestId);
        if (!entry) return reject('HOST_RESPONSE_UNEXPECTED');
        // Only the initiating renderer can complete an outstanding fixed operation.
        clearTimeout(entry.timer); state.pending.delete(response.requestId);
        if (response.ok === true) entry.resolve(response.value);
        else entry.reject(Object.assign(new Error('Existing runtime failed'), {
            requestId: response.error?.requestId,
            generationResult: response.error?.generationResult,
        }));
        return { status: 'received' };
    });
    ipcMain.handle('whihm:runtime-progress', (event, response) => {
        if (!trusted(event)) return reject('HOST_SENDER_REJECTED');
        if (!sessions.get(event.sender.id)?.pending.has(response?.requestId)) return reject('HOST_RESPONSE_UNEXPECTED');
        // Fixed scalar allowlist; no provider payload or credential is forwarded.
        const value = response.value || {};
        const progress = Object.fromEntries(['status', 'progress', 'step', 'totalSteps', 'requestId'].filter(key =>
            (typeof value[key] === 'number' && Number.isFinite(value[key])) || (typeof value[key] === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value[key]))
        ).map(key => [key, value[key]]));
        event.sender.send('whihm:status', { ...progress, operationId: response.requestId });
        return { status: 'received' };
    });
}
module.exports = { register, multimediaHostEnvironment };
