const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localAI', {
    isElectron: true,

    // ── sd.cpp engine ──────────────────────────────────────────────────────
    getBinaryStatus: () => ipcRenderer.invoke('local-ai:binary-status'),
    downloadBinary: () => ipcRenderer.invoke('local-ai:download-binary'),

    listModels: () => ipcRenderer.invoke('local-ai:list-models'),
    downloadModel: (modelId) => ipcRenderer.invoke('local-ai:download-model', modelId),
    downloadAuxiliary: (auxKey) => ipcRenderer.invoke('local-ai:download-auxiliary', auxKey),
    deleteModel: (modelId) => ipcRenderer.invoke('local-ai:delete-model', modelId),
    cancelDownload: (modelId) => ipcRenderer.invoke('local-ai:cancel-download', modelId),

    generate: (params) => ipcRenderer.invoke('local-ai:generate', params),
    cancelGeneration: () => ipcRenderer.invoke('local-ai:cancel-generation'),

    // ── Wan2GP engine (local folder or remote MCP server) ──────────────────
    wan2gp: {
        getConfig:  () => ipcRenderer.invoke('wan2gp:get-config'),
        setConfig:  (cfg) => ipcRenderer.invoke('wan2gp:set-config', cfg),
        setUrl:     (url) => ipcRenderer.invoke('wan2gp:set-url', url),
        check:      (cfg) => ipcRenderer.invoke('wan2gp:check', cfg),
        pickFolder: () => ipcRenderer.invoke('wan2gp:pick-folder'),
        probe:      (url) => ipcRenderer.invoke('wan2gp:probe', url),
        listModels: () => ipcRenderer.invoke('wan2gp:list-models'),
        generate:   (params) => ipcRenderer.invoke('wan2gp:generate', params),
        cancelGeneration: () => ipcRenderer.invoke('wan2gp:cancel-generation'),
        uploadFile: (payload) => ipcRenderer.invoke('wan2gp:upload-file', payload),
    },

    // Progress events — both engines emit on local-ai:progress
    onProgress: (callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on('local-ai:progress', listener);
        return () => ipcRenderer.removeListener('local-ai:progress', listener);
    },
    onDownloadProgress: (callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on('local-ai:download-progress', listener);
        return () => ipcRenderer.removeListener('local-ai:download-progress', listener);
    },
});

// Fixed WHIHM channels only; no generic IPC or filesystem access is exposed.
contextBridge.exposeInMainWorld('whihmHost', {
    getMultimediaRuntimeStatus: request => ipcRenderer.invoke('whihm:getMultimediaRuntimeStatus', request ?? {}),
    finishMedia: request => ipcRenderer.invoke('whihm:finishMedia', request),
    planMediaFinishing: request => ipcRenderer.invoke('whihm:planMediaFinishing', request),
    inspectMedia: request => ipcRenderer.invoke('whihm:inspectMedia', request),
    planMediaInspection: request => ipcRenderer.invoke('whihm:planMediaInspection', request),
    getPlanningOverview: (...args) => ipcRenderer.invoke('whihm:getPlanningOverview', args.length ? { unsupportedArguments: true } : {}),
    getCapabilityContext: (capabilityId, ...args) => ipcRenderer.invoke('whihm:getCapabilityContext', { capabilityId, ...(args.length ? { unsupportedArguments: true } : {}) }),
    getExecutorContext: (executorId, ...args) => ipcRenderer.invoke('whihm:getExecutorContext', { executorId, ...(args.length ? { unsupportedArguments: true } : {}) }),
    getCapabilityProjection: () => ipcRenderer.invoke('whihm:getCapabilityProjection', {}),
    openProject: request => ipcRenderer.invoke('whihm:openProject', request),
    getWorkflow: request => ipcRenderer.invoke('whihm:getWorkflow', request),
    getAsset: request => ipcRenderer.invoke('whihm:getAsset', request),
    planNode: request => ipcRenderer.invoke('whihm:planNode', request),
    executeNode: request => ipcRenderer.invoke('whihm:executeNode', request),
    assessWorkflowReadiness: request => ipcRenderer.invoke('whihm:assessWorkflowReadiness', request),
    applyWorkflowApproval: request => ipcRenderer.invoke('whihm:applyWorkflowApproval', request),
    applyWorkflowInvalidation: request => ipcRenderer.invoke('whihm:applyWorkflowInvalidation', request),
    runtimeReady: () => ipcRenderer.invoke('whihm:runtime-ready'),
    runtimeResult: response => ipcRenderer.invoke('whihm:runtime-result', response),
    runtimeProgress: response => ipcRenderer.invoke('whihm:runtime-progress', response),
    onRuntimeRequest: callback => {
        const listener = (_event, request) => callback(request);
        ipcRenderer.on('whihm:runtime-request', listener);
        return () => ipcRenderer.removeListener('whihm:runtime-request', listener);
    },
    onStatus: callback => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on('whihm:status', listener);
        return () => ipcRenderer.removeListener('whihm:status', listener);
    },
});
