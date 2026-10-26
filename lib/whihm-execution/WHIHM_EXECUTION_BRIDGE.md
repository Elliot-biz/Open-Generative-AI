# WHIHM → existing application execution bridge

Open Generative AI is the application foundation. Reuse its clients, catalogs,
polling, uploads, IPC and inference engines before adding infrastructure. This
module is application integration, **not** another workflow core or execution engine.
No UI executes it automatically. Import `createExecutionBridge` from `bridge.mjs`.
The source-checkout Electron application now exposes the fixed nonvisual host API
documented below; application release packaging remains a separate milestone.

## Runtime map (inspected upstream, unchanged)

| Area | Existing implementation / behavior |
| --- | --- |
| Shared MuAPI | `packages/studio/src/muapi.js`: model-specific generation functions; internal `submitAndPoll`; `x-api-key` supplied by host; `uploadFile` uses browser File/FormData/XMLHttpRequest, progress and timeout; `onRequestId` callback; returns prediction metadata, URL and request ID |
| Polling | `packages/studio/src/utils/generationLifecycle.js`: prediction status, retry of transient poll errors, completion/failure/cancellation, request ID on thrown errors, refund metadata. No new polling here |
| Models | `packages/studio/src/models.js`: endpoints, input schemas, enum/range/default metadata and model families. Its provider labels often mean model vendor, not transport provider. WHIHM transport is `muapi` |
| Capability helpers | `imageInputContracts.js`, `modelCapabilities.js`, `modelParameters.js`, `imageSizing.js`, `videoToolCapabilities.js`, `groupedVideoModels.js` in studio. Existing generation functions retain payload construction/defaulting/mapping |
| Costs | `estimateV2VCost` and `calculateDynamicCost` in studio MuAPI client call remote estimate services. Bridge never calls them during planning; estimatedCost is explicitly null, not a zero-cost promise. Actual upstream cost/refund metadata retained |
| Remote workflows | Vibe-Workflow `NodeFlow.jsx` saves `/api/workflow/create`, runs `/api/workflow/{id}/run`, polls run status; node components run `/api/workflow/{workflow}/node/{node}/run` with run_id/model/params/cost. Dependencies and embedded references are part of persisted remote definition; editor architect endpoints generate remote definitions |
| Shared workflow facade | studio `executeWorkflow`, `runSingleNode`, `getNodeStatus`, schema and persistence functions; `executeWorkflow` requires a remotely registered workflow ID and polls api-outputs. Unsuitable for arbitrary local canonical documents without write-back, so deliberately not used |
| React studios / web | shared Image/Video/Audio/LipSync/Cinema studios call studio MuAPI functions. Cinema reuses image generation. Studios manage gallery/pending/persistence state and downloads separately from the client; no single shared canonical job database |
| Web transport | studio BASE_URL selects `/api` on HTTP(S), direct MuAPI on SSR/file renderer. Next catch-all routes under `app/api/api/v1` and `app/api/workflow` proxy requests. Existing auth context supplies key; this bridge has no credential store |
| Desktop/Vite | `src/components/*.js` use the separate `src/lib/muapi.js` class and `src/lib/localInferenceClient.js`; models re-export the studio catalog, polling reuses studio lifecycle. `src/lib/pendingJobs.js` maintains browser-local pending-job recovery. No desktop client replacement |
| Electron local | `electron/main.js` registers handlers; `electron/preload.js` exposes `window.localAI`. `src/lib/localInferenceClient.js` dispatches `generate` by local catalog provider to sd.cpp or Wan2GP; supports availability/progress/cancel. No model downloads invoked by bridge |
| sd.cpp | `electron/lib/localInference.js`: model/binary checks, child process, progress, cancellation, returns image data URL/seed; temporary output removed. Paths resolved via `localInferencePaths.js` |
| Wan2GP | `wan2gpProvider.js`, `wan2gpLocal.js`, `wan2gpMcp.js`, `wan2gpCatalog.js`: existing local CLI or configured MCP transport, job handling, download/save, cancellation; returns file URL/path/mediaType/seed. Settings and runtime files live outside canonical project data |
| Results/history | MuAPI predictions expose outputs/url/status/request_id/cost; studio getHistory/deleteMedia use upstream history; studio component/localStorage galleries and desktop pendingJobs retain their current ownership. Bridge does not write galleries, history or downloads |

The existing application has two frontend implementations; neither was rewritten.
The new bridge reuses the shared studio facade rather than copying the older
standalone class. Model-specific upstream filtering/defaulting still applies.

## Boundary and usage

```js
import { createExecutionBridge } from './lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime } from './lib/whihm-execution/runtime.mjs';

const runtime = createApplicationRuntime({
  getApiKey: () => existingHostAuthContext.apiKey,
  // Optional host File loader in a browser-capable host:
  fileFromPath: existingHostFileLoader,
});
const bridge = createExecutionBridge({ runtime });
const request = {
  workflow, nodeId: 'reference_image', project,
  inputs: { prompt: 'A product photo' },
  assetBindings: { image_url: 'reference_asset' },
};
const plan = await bridge.plan(request); // no credentials, upload or submission
// Only a separate authorized action should do this:
const result = await bridge.execute(request, { allowExecution: true });
```

The request uses existing canonical node/executor/port/parameter fields. It takes
an existing workflow for reference validation; only the selected node's translated
parameters reach the runtime. It never copies the graph to MuAPI or changes canonical
state. Resolved inputs use declared port IDs matching studio parameter names.
Conflicting parameter/input values are rejected; unresolved template dependencies
are rejected, not evaluated. A scheduler or caller must supply resolved values.

`node.metadata.oga.mode` optionally disambiguates `t2i`, `i2i`, `t2v`, `i2v`,
`audio`, `lipsync`, `recast`, `motion_control`, `v2v`. Without it, catalog lookup must identify exactly one route.
No guessed unknown-model fallback. `executor.provider='muapi'` selects transport;
model vendor labels such as Google/ByteDance do not change that transport.
Audio mode preserves `parameters.model` as the audio version and passes canonical
executor.model as existing `_modelId`. Other routes prohibit model overrides.

Runtime binding calls the existing functions unchanged. Its key is closure-only;
no auth lookup occurs on plan. No network code, endpoint construction, polling loop,
job store, scheduler or provider registry is implemented in these modules.

## Assets and environment limitations

Asset bindings must name a declared input port and a node assetRef. The existing
project handle resolves/checks the registered asset; plan contains only logical ID,
project-relative path and an obvious placeholder URL. Execute uploads via existing
studio `uploadFile`, substituting the returned safe URL in a detached parameter map.
Absolute resolved paths are passed transiently to the host File loader only; no
workflow, manifest, history or preset is updated. Replanning occurs before execution.
The host is responsible for supplying the correct project handle and permission to
read/send its assets. A transferred asset is not automatically deleted on job failure.

The bridge is Node/application-side because canonical validation/project APIs use
Node filesystem modules. It is not a browser bundle entry point. Shared remote
text-only requests work in Node; the shared uploader requires XHR and a host File
loader. A pure Node host without that upload boundary receives UPLOAD_HOST_REQUIRED.
Do not add another upload HTTP client just to work around this boundary.

Local requests use existing localAI.generate when a host binds the existing client
and availability function. Tests exercise the actual client with a fake preload.
In plain Node/browser the default is LOCAL_RUNTIME_UNAVAILABLE. Current Electron
renderer is context-isolated with nodeIntegration false; it cannot directly import
this Node orchestration module. The nonvisual Electron host now connects main-process
project/bridge operations to existing renderer/preload services through fixed IPC.
Local installed-model readiness remains upstream's authority.
Wan2GP may point at a configured remote MCP server; local-ai does not guarantee
physically offline execution. Local project-asset binding is currently rejected
rather than guessing sd.cpp/Wan2GP-specific input roles or staging files.

## Validation, plans and normalized results

Existing canonical validation/secret detection runs first. Reuse existing image
contracts and media-capability helpers; add only enum/type/range/required checks
against the same catalog (including fractional-step numeric declarations). Validation
is intentionally partial: complex nested model rules and upstream parameter
filtering remain authoritative. It is not a complete provider OpenAPI validator.

Plan includes identity, runtime method, model, mode-implied media type, parameter
summary, resolved inputs, required uploads, capability status and cost uncertainty.
It does not obtain keys, probe local engines, estimate costs remotely or run jobs.
Execution requires allowExecution true even for utilities. This is a safety boundary,
not a comprehensive budget policy or approval system.

Result includes canonical identity, runtime/provider/model/tool, status,
upstreamStatus, requestId, typed outputs, cost and sanitized upstream metadata.
Success aliases map to succeeded; failed/error and cancelled/canceled map accordingly;
other lifecycle states remain intact, and empty unclassified results are unknown.
No new state machine. Error messages from upstream are not echoed because they can
contain request/auth details. Structured upstream generation metadata and request IDs
are retained after sanitization. Credential fields and signed URLs are redacted.
Signed outputs will need a future trusted host download/import path, not persistence
of signed credentials. Data/file URLs from local engines are transient results, not
portable asset records; import outputs into project assets in a later explicit step.
Heuristic secret screening is not a guarantee against hidden sensitive arbitrary prose.

## Utility extension

One optional `{tool, validate(parameters), run(parameters)}` host binding supports
an explicitly selected deterministic utility without provider assumptions. It is
not a registry or execution framework. Test identity utility only; no FFmpeg,
HyperFrames, shell commands or media processing. Unsupported control/tool routes
fail closed. V2V/clipping and other specialized studio routes
remain unbound pending targeted payload tests; their upstream code is untouched.

## Deliberately not rebuilt

No workflow execution scheduler, remote workflow persistence/write-back, architect,
retry framework, credential vault, job database, gallery, downloads, cancellation
facade, provider catalog, costs, model installation, IPC, UI or packaging. Existing
cancellation/progress/pending-job APIs remain available in upstream; this first
awaited single-node bridge does not persist request IDs before completion. The host
now forwards existing request-ID, upload and local-progress callbacks without adding
persistence or cancellation machinery. No providers beyond existing MuAPI/local paths were added.

## QA / rollback

```sh
node --test tests/whihmExecutionBridge.test.mjs
npm run test -w whihm-workflow-core
npm run check -w whihm-workflow-core
node --check lib/whihm-execution/bridge.mjs
node --check lib/whihm-execution/runtime.mjs
npm exec --no -- eslint lib/whihm-execution/*.mjs tests/whihmExecutionBridge.test.mjs
node --test tests/*.test.js
```

Tests use fixtures/fake fetch/fake preload and the actual existing client functions;
no real request, model, download or paid generation. Project tests clean temporary
fixtures. Core/workspaces/lockfiles/submodules remain unchanged. Rollback consists
only of removing this new directory and its test file after preserving desired work.


## Electron application host (nonvisual)

`electron/main.js` registers `electron/lib/whihm-host.js`. The existing preload
exposes `window.whihmHost` with fixed `openProject`, `getWorkflow`, `getAsset`,
`planNode`, `executeNode`, and `onStatus` operations. Internal fixed transport
methods (`runtimeReady`, `onRuntimeRequest`, `runtimeResult`, `runtimeProgress`)
connect to `src/lib/whihmHostRuntime.mjs`, initialized once by `src/main.js`.
There is no generic IPC channel argument, filesystem read, shell or execution API.
No visual controls, menus or settings were added.

```js
const opened = await window.whihmHost.openProject({ projectRoot: selectedProjectRoot });
// Check opened.status before continuing. Only root selection takes an absolute path.
const request = {
  projectHandle: opened.projectHandle,
  workflowId: 'selected_workflow', nodeId: 'image',
  assetBindings: { image_url: 'reference_asset' },
};
const workflow = await window.whihmHost.getWorkflow(request);
const asset = await window.whihmHost.getAsset({
  projectHandle: opened.projectHandle, assetId: 'reference_asset',
});
const off = window.whihmHost.onStatus(status => { /* future UI consumer */ });
const plan = await window.whihmHost.planNode(request);
// Separate explicit authorization required. Do not call for a dry run:
// await window.whihmHost.executeNode({ ...request, allowExecution: true });
// off() removes the listener.
```

The root is transient, absolute and local, with traversal rejected. Existing project
validation rejects invalid manifests, unsafe internal paths, symlinks and corrupt
assets. Successful open returns an opaque session handle, project ID and portable
manifest, not an absolute path. The handle is scoped to the originating renderer;
each operation reopens and verifies the saved project identity. Workflow/node IDs
select canonical data from disk; the renderer cannot inject replacement workflow
objects or a filesystem path into generation. Assets are addressed by ID only.
At most 32 open handles per renderer are retained until navigation/window disposal.
No project/workflow/history writes are performed by this host.

Flow: renderer API → checked main IPC → `host.mjs` → existing project APIs → existing
bridge → fixed request to renderer → existing studio function or local client →
existing normalized bridge result. `planNode` ends at bridge planning, without a
renderer execution request, authentication, upload, remote cost query or polling.
Execution without literal `allowExecution: true` rejects before reading the project.
There is no force execution, automatic retry, scheduler or queue. A second concurrent
host execution returns `HOST_EXECUTION_BUSY` to avoid overlapping host operations.

For uploads, main resolves the asset again through project APIs, reads only its
validated relative path, and verifies size/checksum after reading. The current
64 MiB asset limit is retained. Main sends Uint8Array/name/contentType, never the
absolute path. Renderer makes a native File and calls unchanged studio `uploadFile`
(FormData/XHR). Credentials remain in the existing renderer auth context:
`window.__MUAPI_KEY__` or `localStorage.muapi_key`. They are not passed to main.
Shared studio generation functions still own endpoint mapping, submission and
polling. `onRequestId` is forwarded as running/requestId, upload callbacks as
uploading/progress, and existing local progress states are preserved. Local execution
uses `localInferenceClient.generate` → existing `window.localAI` → existing sd.cpp
or Wan2GP IPC handlers; no new inference entry point or launcher.

Runtime replies are correlated to outstanding main-originated requests and checked
against the exact owning BrowserWindow, its main frame, and local dist/index.html URL.
Subframes, other windows and navigated remote content are rejected. Navigation or
window destruction clears handles and rejects outstanding transports. Transport
waits have a 35-minute ceiling; disconnect/timeouts do NOT cancel an upstream job
or retry it. Reported failure in that case means completion is unknown; inspect
existing upstream history before attempting another paid operation. Existing local
progress is global; no new per-job progress service is claimed.

Results preserve the bridge contract, cost/refund metadata and request IDs. Before
IPC, renderer errors omit raw messages and use structured fields. Credential-looking
fields and signed URLs are redacted; local absolute paths/file URLs are omitted.
Consequently a Wan2GP file result is not yet a portable usable project output: output
import/registration is a separate later step. sd.cpp data URLs and safe public URLs
remain available transiently. Error codes include existing project/bridge errors,
`HOST_SENDER_REJECTED`, `PROJECT_HANDLE_INVALID`, `HOST_EXECUTION_BUSY`,
`EXECUTION_NOT_AUTHORIZED`, `HOST_RESPONSE_UNEXPECTED`, `HOST_COMPONENTS_UNAVAILABLE`
and `UPSTREAM_ERROR`. No raw Error object crosses IPC.

### Electron compatibility and release boundary

Installed Electron 33.4.11 embeds Node 20.18.3. A direct bridge import fails because
upstream .js ESM is classified as CommonJS there. `whihm-esm-loader.mjs` supplies
only an ESM format hint for studio/src/*.js and the two existing local-client/catalog
files. It changes neither source nor package module types, and leaves other modules
alone. The default host bootstrap registers this shim before importing the bridge.
This was tested with the actual installed Electron executable in RUN_AS_NODE mode,
using fake Electron transport/preload boundaries and no model execution.

The source-checkout `npm run electron:dev` path has the required files. Existing
release `build.files` includes only dist/electron, not lib/whihm-execution or core
sources. **Packaged installers do not yet deliver these host dependencies** and
return `HOST_COMPONENTS_UNAVAILABLE`; missing components do not crash the application.
No Electron Builder, Windows installer, NSIS or package configuration was changed.
Adding host dependencies to future release delivery is explicitly deferred; this is
not a claim of packaged Windows/USB readiness or a graphical desktop smoke test.
Web builds have no whihmHost and connector startup is a no-op. There is no new web API.

Additional checks:

```sh
node --test tests/whihmHost.test.mjs
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron --input-type=module -e "import {register} from 'node:module'; register(new URL('./electron/lib/whihm-esm-loader.mjs', import.meta.url)); await import('./tests/whihmHost.test.mjs');"
npm run vite:build
```

Host tests execute the real preload wrapper, host registration, project APIs and
bridge, with fake Electron IPC endpoints; actual shared fetch/polling and XHR upload
functions are exercised through fake transports. They include sender/path rejection,
serialization, disconnect, concurrent-execution refusal and local preload routing.
No provider requests, model runs or user credentials are used.

Host rollback: restore only the added registration in electron/main.js, added
whihmHost exposure in electron/preload.js, connector initialization in src/main.js,
and this documentation update; remove the five newly added host/test modules.
Keep the committed bridge/core intact. Rebuild Vite assets after reverting startup.

## Whole-workflow readiness evidence

[READINESS_EVIDENCE.md](./READINESS_EVIDENCE.md) documents the nonvisual application
adapter for project assets, shared static runtime bindings, supplied local snapshots
and external quotes. It calls the existing workflow-core readiness evaluator.
`resolveExecutionBinding` is shared with execution; no provider calls or local probes
are made while gathering readiness evidence.

## Recast contract and application parity

Canonical remote nodes may use `metadata.oga.mode: "recast"` with the existing
`kling-v3.0-pro-recast`, `runway-act-two-recast` or `wan2.2-animate-recast` aliases.
They resolve to **existing `studio.processRecast`**, using the existing shared
submit/poll/upload/result lifecycle. The application class also exposes
`MuapiClient.processRecast(params)` as a thin authenticated delegation to that same
service. No Body Swap UI is added to desktop and no client/poller is duplicated.

`packages/studio/src/recastInputContracts.js:buildRecastRequest` is a pure shared
validator/mapper used by service calls and bridge planning. Existing Recast model
entries remain the source of truth for endpoint and options. Logical video input
is `video_url`; Act Two maps it to `reference_video_url` and also accepts that
explicit native field. Conflicting fields reject. Character `image_url` and a
nonempty driving video are always required. The exact Act Two I2V model also uses
this contract and declares its driving video in shared media metadata; unrelated
I2V/V2V behavior is unchanged. The desktop application delegates this exact Act Two
I2V model to the shared service too, avoiding the older client's dropped driver field.

- Kling preserves prompt/orientation behavior and optionally forwards the boolean
  `keep_original_sound`. If omitted, provider defaults remain unchanged. Orientation
  metadata describes the existing 10s image / 30s video limits; this layer does not
  probe duration or claim frame/camera/audio fidelity.
- Wan explicitly sends `mode: "animate"` when omitted, preserving prior behavior;
  `replace` is available nonvisually. Optional prompt and 480p/720p resolution survive.
  Unsupported modes/settings reject before transport. The existing Studio UX remains
  unchanged and therefore still uses default animate; there is no new mode selector.
- Act Two sends the character image and **only `reference_video_url`**, retaining
  its supported aspect ratio. Unsupported options, including prompts for this
  backend, reject rather than disappear silently.

Plans expose endpoint, upstream parameter keys, required media roles, supported
options and effective options (including Wan's default), while preserving canonical
model/node identity and relative asset references. Missing/invalid inputs produce
structured `RECAST_*` diagnostics with the relevant field path. Planning never
looks up credentials, uploads, submits or polls. Existing host/bridge execution
still requires explicit authorization. Readiness discovers these bindings through
its existing resolver; it is not a provider availability probe or price quote.

No provider was called to verify output quality or backend acceptance. Contract
expectations reuse the audited public schemas; tests use fake HTTP/upload/local
boundaries. No general V2V, Seedance Motion Control, UI, packaging, project-format
or canonical-schema changes are part of this milestone.

Focused checks:

```sh
node --test tests/recastExecution.test.mjs tests/whihmExecutionBridge.test.mjs tests/whihmHost.test.mjs tests/whihmReadinessEvidence.test.mjs
```

## Seedance Motion Control

Canonical nodes may select `metadata.oga.mode: "motion_control"` with
`seedance-2.5-motion-control` or `seedance-2-motion-control`. The route calls the
existing **`studio.processMotionControl`**, never a new provider client. The desktop
application class adds only a delegation of the same name to that shared service.
The fixed host runtime allowlist derives from existing routes and requires the same
explicit execution authorization. There is no new IPC operation or desktop Studio.

The existing model catalog supplies limits; the feature-specific pure
`motionControlInputContracts.js:buildMotionControlRequest` validates and prepares the
existing request before service submission or bridge planning. Model and intent mode
are explicit. `motion_transfer` and `objects_swap` keep their existing, distinct
instruction prefixes, followed by the optional trimmed user prompt. These modes
are prompt policies, **not provider payload mode fields or preservation guarantees**.
Model/node identity and the caller's canonical parameters remain unchanged.

| Contract | Seedance 2.5 | Seedance 2.0 |
| --- | --- | --- |
| Endpoint | `/api/v1/seedance-2.5-motion-control` | `/api/v1/seedance-2-motion-control` |
| Required application media | `video_url` + 1–30 `images_list` references | `video_url` + 1–9 `images_list` references |
| Duration | integer 4–30 inclusive; default 5 | integer 4–15 inclusive; default 5 |
| Aspect | Existing catalog ratios including adaptive | Existing six ratios; adaptive rejected |
| Generated audio | `generate_audio`, boolean, default false | Same |
| Other controls | `high_bitrate` boolean default false; optional integer seed −1…4294967295 | `quality` high/basic, default high |
| Resolution / audio-reference inputs | Not exposed by current contract | Not exposed by current contract |

Read-only public metadata was checked on 2026-10-25: GET
[`/api/v1/models/seedance-2.5-motion-control`](https://api.muapi.ai/api/v1/models/seedance-2.5-motion-control),
[`/api/v1/models/seedance-2-motion-control`](https://api.muapi.ai/api/v1/models/seedance-2-motion-control),
and the two endpoint request schemas in
[`/openapi.json`](https://api.muapi.ai/openapi.json). No credentials, quotes,
generation, uploads or jobs were used for verification.

Two deliberate product/provider distinctions:

- Both provider schemas require only video and permit optional images. OGA Studio
  already requires at least one image; this application contract preserves that
  behavior rather than relaxing it or fabricating references.
- The source catalog previously advertised seed support for 2.0, but **neither live
  model metadata nor OpenAPI lists it**. The source flag is corrected, that Studio
  seed input is disabled for 2.0, and supplying seed to the service rejects before
  transport. 2.5 preserves even explicit seed −1. OpenAPI also has a webhook field,
  but the existing shared Motion Control service did not expose it; this task does
  not introduce a webhook route or neighboring models' resolution/audio inputs.

The Studio's request assembly now sends only controls supported by the selected
model, avoiding stale quality/bitrate/seed fields from other selections. Layout,
intent controls, navigation, uploads and result UI are unchanged. Existing visual
control adjustment on model selection remains; the service never clamps duration,
truncates references or coerces numeric/boolean strings before submission.

Ordered references are preserved without sorting, deduplication, filtering or
truncation. Legacy `images` (array/single URL) and `image_url` input forms remain
explicitly normalized; conflicting representations reject. Invalid members,
unsupported options/models/modes, count/range/type failures and missing media return
structured `MOTION_*` errors with field paths. No transport follows rejection.

For project images, the existing request can use:

```js
assetBindings: {
  video_url: 'registered_driver',
  images_list: ['registered_reference_b', 'registered_reference_a'],
}
```

Array bindings are accepted **only for Motion Control's `images_list`**. Each item
uses the existing project registry/path/integrity checks and uploader; input order
is retained with an index in `requiredUploads`. No physical path is stored in the
workflow or exposed in the plan. Count validation precedes runtime byte-loading for uploads. Project resolution and
integrity checks may read/checksum registered files.
No project format, canonical schema, asset registry or uploader was added.

Plans expose required roles, selected intent/model, reference count/limits, duration
and its bounds, supplied options, effective settings and upstream parameter keys.
They do not look up credentials, construct upload Files, upload, submit or poll. Existing
readiness discovers the new binding through its current resolver; detailed request
validation is performed by the existing plan operation, not a new readiness engine.
Cost remains unknown unless independently supplied; no automatic quote refresh.

Only the two audited base endpoints gain canonical bindings. Existing shared-service
Intl/Spicy variants retain source-catalog handling, but do not gain WHIHM routes in
this milestone; their provider contracts were not refreshed here. No generic V2V
binding or capability projection is introduced. Conflicting provider descriptions
about location preservation remain unresolved: camera/location/pixel preservation
are creative intentions, not validated or measured output invariants.

Targeted mocked QA:

```sh
node --test tests/motionControlExecution.test.mjs tests/recastExecution.test.mjs tests/whihmExecutionBridge.test.mjs tests/whihmHost.test.mjs tests/whihmReadinessEvidence.test.mjs
```

All execution/upload/lifecycle tests use fake transports and harmless fixtures.
No model/agent/local inference, real upload, paid generation or media processing is
performed. Existing Recast coverage remains, apart from removing the now-obsolete
assertion that Motion Control has no route.


## Reviewed shared V2V execution

`metadata.oga.mode: 'v2v'` selects the **existing** shared `processV2V` through
`runtime.mjs`; the older application `MuapiClient.processV2V` delegates to that
same service. Existing authentication, uploader, submit/poll lifecycle, request
IDs, cost/refund metadata and normalized result behavior remain authoritative.
No new client, polling engine, provider payload API or execution authorization.

The bounded [V2V contract review](V2V_CONTRACT_REVIEW.md) accounts for all 75
current source entries and documents the original nine-model admission (later waves below):

- `runway-aleph-v2v`, `wan2.2-edit-video`, `seedance-2.5-video-edit`
- `runway-act-two-v2v`, `ai-video-face-swap`, `video-background-remover`
- `ai-video-upscaler`, `topaz-video-upscale`, `heygen-video-translate`

The shared pure `v2vInputContracts.js` projects existing Studio catalog/overrides;
its small eligibility set contains IDs only, not another model catalog/schema.
Reviewed service calls and plans use the same validation. Required source video,
prompt/reference requirements, enum/type/range/count checks and unsupported-option
rejections occur before authentication/upload/submission in the canonical path.
No silent clamping, reference truncation, ordering changes, option dropping or
model/route fallback. Arrays preserve duplicates and order. The existing desktop
single `image_url` form explicitly maps to Seedance `images_list: [image_url]`;
competing forms reject. Configurable `options` fields may also be top-level;
conflicts reject. Arbitrary raw provider fields are not accepted.

Act Two **V2V** requires a character video plus `reference_video_url`; Recast
requires a character image plus driving video and keeps its separate alias.
Kling Recast, Wan Animate and Lip Sync provider endpoints are deliberately not
admitted under generic V2V. Their specialized routes remain intact; selecting the
wrong explicit mode rejects rather than rerouting. Motion Control remains separate.
All other current V2V entries remain on their existing OGA paths and are unavailable
through canonical V2V until their contracts are reviewed.

Targeted upstream corrections: Wan resolution and Act Two aspect no longer
vanish in shared payload construction; Act Two records both required videos;
base Seedance 2.5 edit now declares its live resolution enum instead of unsupported
aspect ratio and is identified as a native-resolution endpoint. No neighboring
variants or unrelated I2V/T2V contracts were altered.

A valid plan reports exact provider/model/endpoint, `requiredMedia`,
`supportedOptions`, `effectiveOptions` (including defaults), and `request.v2v`
with family/purpose, required/supplied input names and media count/limits.
Invalid plans return structured diagnostic codes and field paths:
`V2V_REQUIRED_INPUT_MISSING`, `V2V_OPTION_UNSUPPORTED`, `V2V_OPTION_INVALID`,
`V2V_INPUT_CONFLICT`; unsupported canonical models produce the existing
`MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS`. The pure helper uses
`V2V_REQUEST_INVALID` / `V2V_MODEL_UNSUPPORTED` for invalid requests/models.
Planning never reads credentials, loads asset bytes, uploads, estimates, submits
or polls. Existing readiness evidence reports the binding as plannable; detailed
resolved-input validation remains in planning, not a competing readiness engine.

Project `assetBindings` use the existing validated project resolver. Reviewed V2V
media-array fields (Seedance image/audio references) support ordered asset ID
arrays; absolute host paths stay transient. Execution still requires explicit
host authorization. No canonical document, project file or history changes.

Limits: face-swap target filters and background-removal container/audio controls
are not declared by current OGA metadata and reject rather than disappearing.
HeyGen defaults visibly to Hindi if language is omitted. URL-only validation
cannot prove dimensions, bytes, codec or source duration; provider-side Seedance
trimming of long source videos is documented in the review, not a local precision
guarantee. No media probe or network checks were added. No UI or packaging changes.


### Wave 1 extension (safe partial coverage)

Seven exact models join the original nine: `seedance-2.5-video-extend`,
`seedance-2-video-edit`, `wan2.7-video-edit`, `wan2.7-video-extend`,
`kling-o1-video-edit`, `kling-o1-video-edit-fast`, `kling-o1-standard-video-edit`.
See [verified contracts and provider discrepancies](V2V_CONTRACT_REVIEW.md#wave-1-review--2026-10-25-safe-partial-admission).

Seedance 2.0 retains native `video_urls` as an array, currently exactly one source
per public OpenAPI, plus ordered `images_list` and `audio_files`. Its existing
`seedance-v2.0-video-edit` execution endpoint is preserved. Multiple sources reject;
no scalar coercion or flattening. Existing Studio `videos_list` / `audios_list`
aliases normalize explicitly to native array fields; competing forms reject.
The existing project-asset array path already supports these fields.

Base Seedance 2.5 extend retains optional `last_image`, aspect ratio, duration,
audio, seed and bitrate, and adds verified native resolution. Wan 2.7 edit retains
optional images/audio-setting; extend's guiding audio is optional and duration
means total output length. Kling references are 0–4; its wire list defaults to []
even though no actual reference images are required. Standard rejects aspect;
full/fast retain their own enums. No variant substitutions.

Plans now include detached control schemas/ranges/defaults and ordered media
minimum/maximum counts. Required media is distinct from required empty wire lists.
The six Standard Seedance fixed-resolution edit/extend variants remain unbound:
model metadata omits resolution, while OpenAPI exposes a common 720p-default
resolution field on every suffix. Exact override/output-resolution semantics need
first-party clarification. Intl/Spicy profiles remain unbound too. The original
nine-model subset is retained; no UI, execution lifecycle or security changes.


### Wave 2: Gemini edit and Flux 3 video

Reviewed exact IDs: `gemini-omni-flash-1-1-edit`, `flux-3-video-extend`,
`flux-3-video-extend-draft`, `flux-3-video-upscaler`. All use the existing shared
V2V service, catalog contracts, project resolver and execution authorization.
See [Wave 2 evidence and limits](V2V_CONTRACT_REVIEW.md#wave-2-review--2026-10-25).
No bridge/runtime/host/client implementation change was needed.

Gemini requires source video and prompt, with its four-resolution enum/default
720p. Flux full/draft require source video and prompt, preserve extension duration
5–20, aspect and generate_audio. Full also supports 720p/1080p resolution; draft
rejects resolution and leaves omitted aspect unspecified. No full/draft fallback.

Flux upscaler supports optional prompt, numeric factor 1–4 (catalog default 2),
and creativity 0/1. This is AI enhancement; even Precise mode has no deterministic
pixel-preservation guarantee. That caveat appears in the existing plan purpose,
with controls/defaults from the shared catalog. No Topaz/simple-upscale substitution.
All invalid/undeclared options reject before transport. Plans remain auth-, upload-
and submission-free. Existing catalog subsets/defaults are distinguished from
provider-only fields in the review; no raw provider fields are exposed.


### Wave 3: Topaz creative, generative and precision

The exact IDs `topaz-upscale-video-creative`, `topaz-upscale-video-generative` and
`topaz-upscale-video-precision` use existing shared V2V execution. See the
[Wave 3 contracts and evidence](V2V_CONTRACT_REVIEW.md#wave-3-review--2026-10-25).
No new client, poller, upload path, provider options object or canonical schema.

Generative/precision use **topaz_model** for the provider engine. For example:

```js
// Canonical node fields; execution authorization is still separate.
const executionFields = {
  executor: { id: 'studio', type: 'remote-model', provider: 'muapi',
    model: 'topaz-upscale-video-generative', mayCostMoney: true,
    requiresConfirmation: true },
  parameters: { video_url: 'https://example.com/source.mp4',
    topaz_model: 'Starlight HQ', upscale_factor: 2 },
  metadata: { oga: { mode: 'v2v' } },
};
```

Root service params.model remains the selected endpoint. The registered catalog
alias maps validated topaz_model to wire model only at payload construction.
The existing web parameter helper now emits topaz_model too, fixing its endpoint
selector collision without copying Studio code. options.model and arbitrary
provider_options are rejected; canonical parameters.model remains prohibited.
Creative has no provider engine and rejects topaz_model.

Plans keep model as canonical identity, request.v2v.providerModel as engine,
providerModelField as model, and request.effectiveOptions.topaz_model as the named
application option. The actual wire contains model, not topaz_model. Upstream model
metadata cannot overwrite normalized canonical result identity.

All three require source video. Creative supports optional prompt and bounded
creativity/realism/sharp; Generative supports its existing Starlight enum plus
softness only for Precise 2.6; Precision supports its existing 21-engine enum and
bounded restoration controls. Factor 1–4 accepts fractions, FPS is integer 16–60,
H264_output is boolean. Defaults remain explicit and FPS omission stays omitted.
These are AI enhancement/reconstruction paths with no exact preservation guarantee.
Plans show the caveat; no workflow executes automatically when planning/readiness
succeeds. Existing authorization and passive planning behavior remain unchanged.

## Audio Wave 1 — reviewed shared contracts (2026-10-26)

`packages/studio/src/audioInputContracts.js` adds pure `buildAudioRequest(modelId,
params)`, `getAudioExecutionModel`, `getAudioMediaInputs` and
`getAudioContractStatus`. Endpoints/schemas/options/defaults come from the existing
Studio audio catalog; the new intent/admission list does not discover models or
implement transport. **22 of 23 current catalog entries are reviewed and admitted**
to the existing canonical `audio` route. `generateAudio` validates those same
contracts before its existing submit/poll/result lifecycle. Unreviewed application
calls retain the existing generic implementation; this is not canonical admission.
No Audio Studio UI or desktop request builder was added or changed.

| Intent | Reviewed exact IDs | Requirements / scoped controls |
| --- | --- | --- |
| GENERATE_MUSIC | `suno-create-music` | Nonempty style; existing prompt/version/persona/instrumental and bounded weights. Existing catalog V5 default remains explicit |
| REMIX_MUSIC | `suno-remix-music` | Source audio + style; prompt/title and existing Suno settings |
| EXTEND_MUSIC | `suno-extend-music` | Source audio + prompt + style; integer continue_at 1–60 retained from current product contract. Source duration compatibility remains unmeasured |
| MASHUP_MUSIC | `suno-generate-mashup` | Ordered audios_list 1–2, style; prompt also required when instrumental=false. Duplicates preserved |
| ADD_VOCALS | `suno-add-vocals` | Source audio + prompt/style/title (catalog title default allowed); not vocal extraction |
| ADD_INSTRUMENTAL | `suno-add-instrumental` | Source audio + tags/title (catalog title default allowed); not stem separation |
| GENERATE_SOUND | `suno-generate-sounds` | Prompt ≤500 chars, existing loop/tempo 1–300/key/lyrics controls; no invented duration or TTS semantics |
| GENERATE_SOUND | `mmaudio-v2-text-to-audio` → `mmaudio-v2/text-to-audio` | Prompt; integer duration 1–30, default 8. No video-to-audio admission |
| CLONE_VOICE | `minimax-voice-clone` | Source audio, custom_voice_id and preview prompt; preview engine is separate from executor ID, accuracy/noise/volume options validated |
| SYNTHESIZE_SPEECH | `minimax-speech-2.6-hd`, `minimax-speech-2.6-turbo` | Nonempty prompt; supplied/default voice ID, including custom clones; speed 0.5–2, volume 0.1–10, integer pitch −12–12, enums for emotion/language/audio format settings |
| SYNTHESIZE_SPEECH | `elevenlabs-tts-turbo-2-5` | Prompt ≤40000; suggested or custom voice ID; stability/similarity 0–1; speed 0.7–1.2; catalog language enum |
| SYNTHESIZE_DIALOGUE | `elevenlabs-text-to-dialogue-v3` | Nonempty ordered dialogue array; every object requires nonblank text + voice_id; custom IDs accepted; stability 0–1 and language enum |
| SYNTHESIZE_DIALOGUE | `gemini-3-1-flash-tts`, `gemini-2-5-pro-tts` | Nonempty speakers and dialogue_turns; recursive declared fields/types/enums/defaults, unique Speaker N IDs, every turn references a defined speaker; turn text ≤10000; temperature 0–2 |
| CONVERT_SUNO_WAV | `suno-convert-to-wav` | Nonblank task_id + audio_id of an existing Suno track. Not arbitrary URL/file conversion |
| GENERATE_MUSIC | `minimax-music-3.0` | Prompt + lyrics 10–3000 chars (also for current instrumental product form); existing bitrate/sample_rate/is_instrumental |
| SYNTHESIZE_SPEECH | `elevenlabs-v4`, `fish-s2-1-pro` | Prompt max 2000 / 10000; respective catalog voice choices/defaults |
| GENERATE_MUSIC | `lyria-3-pro`, `lyria-3`, `lyria-2` | Nonblank prompt ≤2000; no borrowed Suno controls |

**Deferred:** `suno-voice-clone` requires a first sample, a fresh random phrase,
and a confirmation recording. Public OpenAPI also exposes
`/api/v1/suno-voice-clone/{request_id}/confirm`, but the current shared generic
submit/poll path does not implement that interaction. Canonical lookup/readiness
therefore reports this model unavailable; direct contract construction returns
`AUDIO_CLONE_LIFECYCLE_UNSUPPORTED`. The existing application generic request is
preserved without claiming it completes cloning. No confirmation flow, voice
management, liveness bypass, or clone persistence system was implemented.

### Identity, defaults and validation

Canonical executor.model always identifies the endpoint. The shared transport's
`_modelId` carries that identity and is never sent to MuAPI. `params.model` may
only be a declared Suno version or MiniMax preview-engine option. It cannot select
a different canonical executor, and unknown options/option bags/raw payloads or
nested fields reject. Existing application callers using model alone as endpoint
selector remain compatible; `_modelId` callers retain the established provider
version distinction. Provider defaults are not guessed: existing catalog defaults
are explicitly materialized, preserving valid current settings rather than
silently adopting newer provider defaults.

Schemas are derived from current source, with narrow validated corrections:
MiniMax clone preview prompt is required per OpenAPI; custom voice IDs are allowed
for MiniMax speech and ElevenLabs suggestion lists; description-only string/TTS
bounds are enforced; Gemini required/default nested properties and cross-speaker
references are checked. No schema is supplied by callers. Numeric types/bounds,
primitive enums, nonempty required arrays/text and nested objects reject before
canonical authentication/upload/submission. No clamping, list truncation, coercion,
reference reordering or dialogue flattening occurs. UI widget step sizes do not
become invented provider quantization. Unselected optional '' enum / null values
from the existing Studio state are omission, with declared defaults where present;
required values still reject. Valid strings and media order remain unchanged.

### Ordered project audio assets and passive planning

Reviewed scalar audio fields and mashup's `audios_list` can use the existing
project assetBindings. Array bindings must be arrays of registered, declared audio
asset IDs on the declared input port; preserve order and duplicates. Each resolves
through existing project path/checksum validation. Empty arrays, malformed roles,
wrong asset type, missing/corrupt records, scalar/array mismatch and competing
parameter/asset bindings reject. Already-resolved URL arrays are also valid;
URL values are not interpreted as filesystem paths or asset IDs. This adds no
arbitrary array-binding permission outside reviewed audio roles.

Plans expose `request.audio` with intent, canonical modelId, separate providerModel,
required inputs/media, array counts/limits/order, and providerRequest endpoint /
normalized payload. Registered files appear as logical placeholders and relative
requiredUploads, never transient absolute paths. effectiveOptions show declared
applied defaults. Planning/readiness performs no auth, upload, estimate, request
submission or polling. Execution still needs explicit allowExecution and uses the
same host File loader, Studio uploader and shared generateAudio lifecycle. Output,
voice ID, request ID, cost/refund and upstream metadata retain existing result
normalization; no new persistence or scheduler is introduced.

Media URL validation checks nonempty HTTP(S) references without embedded userinfo;
canonical validation additionally protects secret-bearing/unsafe references.
Neither URL inspection nor a project checksum proves audio content, duration,
channels, licensing, voice ownership or successful provider acceptance. In
particular, source clip duration limits and continue_at < actual source duration
remain provider/media-inspection constraints, not falsely measured here.

### Contract evidence and deliberate limits

Read-only public inspection: 2026-10-26,
[MuAPI OpenAPI](https://api.muapi.ai/openapi.json) request schemas for all 23 exact
audio endpoints and `GET https://api.muapi.ai/api/v1/models/{id}` for the catalog
entries. 22 detail GETs succeeded; the slash-form MMAudio detail URL returned 404,
so its exact execution endpoint/schema was verified in OpenAPI. No authentication,
upload, estimate or execution call occurred. OpenAPI confirms the Suno clone
confirmation path; no confirmation request was sent.

The provider surface is ahead in a few optional areas: Suno V6 versions,
duration/reference options and a V6 default; sounds V5_5; mashup V4_5ALL. These are
**not** added by this wave. Existing catalog versions/defaults remain a reviewed
subset. Provider add-vocals/add-instrumental source audio is nullable and extend
prompt optional in OpenAPI, while the current product requires them; this wave
keeps the narrower source-based transform/continuation contracts, not a new
reference-free capability. Mashup's metadata limits uploads to two although its
OpenAPI description discusses more; the existing two-track product limit remains
explicit. MiniMax source default emotion remains explicit (surprised), a valid
choice even though OpenAPI's omitted-field default is happy. No source/provider
identity conflict required a new lifecycle or catalog rewrite.

No transcription, separation, MMAudio V2V, lip-sync, clipping, FFmpeg/conversion,
voice-management service, Audio Studio redesign or Astra projection was added.

## Advanced Image Contracts — 2026-10-26

`packages/studio/src/advancedImageInputContracts.js` projects **15 reviewed model
IDs** (17 t2i/i2i model/mode pairs) from the existing catalog, base
`imageInputContracts` and `modelCapabilities`. It provides
`getAdvancedImageStatus`, `getAdvancedImageModel`, `getAdvancedImageMediaInputs`,
`buildAdvancedImageRequest` and specialized result normalization. No client,
catalog copy, uploader, poller, execution mode or provider was added.

| Exact reviewed ID | Canonical mode / semantic scope | Confirmed contract |
| --- | --- | --- |
| `flux-pulid` | t2i / i2i, REFERENCE_GUIDED_IMAGE | Identity-reference image + prompt ≤1500; existing aspect enum |
| `flux-redux` | t2i / i2i, REFERENCE_GUIDED_IMAGE | Composition/style-reference image + prompt ≤1500; aspect/count. Not a separate mask/identity selector |
| `minimax-image-01-subject-reference` | i2i, REFERENCE_GUIDED_IMAGE | Subject image + prompt; source endpoint alias `minimax-01-subject-reference`; aspect/count |
| `ideogram-character` | i2i, REFERENCE_GUIDED_IMAGE | Character image + prompt; render_speed/style/aspect/count enums |
| `vidu-q2-reference-to-image` | i2i, REFERENCE_GUIDED_IMAGE | Ordered images_list 1–7 + prompt; resolution/aspect. No source-array flattening |
| `gemini-omni-character` | i2i, REFERENCE_GUIDED_IMAGE | Exactly one image in images_list + descriptions; optional character_name / audio_ids (existing voice-profile IDs, not audio uploads). Returned character metadata retained |
| `topaz-image-upscale` | i2i, UPSCALE_IMAGE | Source image; numeric integer upscale_factor 1/2/4/8, default 2. Source type string contradicted its numeric enum; derived execution contract corrects the type |
| `seedvr2-image-upscale` | i2i, UPSCALE_IMAGE | Source image; exact lowercase 2k/4k/8k resolution |
| `ai-skin-enhancer` | i2i, ENHANCE_IMAGE | Source image only; no invented skin/face controls |
| `topaz-upscale-image-creative` | i2i, ENHANCE_IMAGE | Bloom 2/Bloom/Bloom Realism; factor 1–4 including fractions; creativity integer 1–9, autoprompt/color-preservation, crop/output settings. No text prompt field |
| `topaz-upscale-image-generative` | i2i, ENHANCE_IMAGE | Existing 9-engine enum, default Wonder 3; factor 1–4; face/sharpen/denoise/detail 0–1; creativity 1–6, texture 1–5; prompt ≤1024 and declared enums/booleans |
| `topaz-upscale-image-precision` | i2i, ENHANCE_IMAGE | Existing 7-engine enum, default Standard V2; factor 1–4; face/sharpen/denoise/compression 0–1, strength 0.01–1; declared crop/output/subject controls |
| `bytedance-seedream-5.0-pro-layer` | i2i, DECOMPOSE_IMAGE request reviewed; editable semantics partial | Source image required for decomposition; prompt optional; resolution auto/1K/1.5K/2K, png/jpeg (default png) |
| `seedream-5.0-flash-layerize` | i2i, DECOMPOSE_IMAGE request reviewed; editable semantics partial | Same source/prompt/resolution shape; output default jpeg, distinct exact endpoint preserved |
| `face-expression-change` | i2i, view-angle subset of CHANGE_IMAGE_EXPRESSION_POSE | Ordered 1–3 images; rotate_right_left −90–90, move_forward 0–10, vertical_angle −1–1, wide_angle_lens, aspect/output. Source fractional steps retained |

**Deferred:** `qwen-image-edit-plus-lora`. Its local catalog exposes angle/view
controls, but current OpenAPI accepts prompt, images_list, loras, aspect_ratio and
output_format instead. It does not declare those angle fields. Canonical lookup /
readiness now rejects that exact model (`IMAGE_VIEW_CONTRACT_CONFLICT` in contract
status), rather than sending unsupported view instructions. Its existing shared UI
and generic service remain untouched. This does not defer all Qwen image editors,
admit arbitrary LoRA objects, or invent a new camera/pose contract.

### Shared execution and narrow application corrections

Reviewed requests still use `generateImage` / `generateI2I` and the existing
submit/poll/result path. The advanced contract validates required roles, ordered
arrays, scalar controls, enums/ranges and unknown fields before transport; missing
references are never manufactured. Unreviewed basic image models retain their
existing path and auxiliary mask, garment, watermark, product-source contracts.

All three image Topaz entries now declare **topaz_model**, with providerField=model,
in existing catalog metadata. Existing Studio parameter controls therefore cannot
overwrite selected executor `model` with an engine name. The pure contract maps
only this declared option to provider wire `model`, and plans show both identities.
`options.model`, arbitrary option bags and cross-endpoint controls reject. Image
ranges are verified independently; no video engine/range metadata was copied.
No engine-specific conditional applicability was published in the inspected
schemas; do not invent coupling rules or claim all engines activate every optional
control identically. These are AI enhancement/restoration/reconstruction requests,
not exact pixel/identity-preserving scaling guarantees.

Two small application metadata/request fixes accompany that collision repair:
Seedream Pro Layer's promptRequired flag is false, consistent with its optional
prompt schema and existing helper; the Image Studio I2I request checks the existing
**selectable** aspect capability instead of forwarding a fallback aspect to a model
with no aspect control. The latter is a nonvisual request hook plus import, not a
layout or editor redesign. Existing Topaz control rendering is reused (engine label
becomes Topaz Engine). The older desktop Image client remains less capable; the
canonical host already calls shared services, so no desktop client was copied or
broad parity work undertaken.

### Project references, aliases and passive planning

Only reviewed native image roles gain array binding support. For example,
`assetBindings.images_list: ['registered_subject_b',
'https://example.com/public-reference.png', 'registered_subject_a']` resolves
registered IDs through existing project integrity/path checks and preserves the
URL entry at its original index. IDs must be declared node assetRefs with canonical
asset type image; remote URL entries are not imported or written as asset records.
Pure already-resolved URL arrays also work as ordinary inputs. No automatic merge
with competing parameter arrays; no generic arbitrary-array permissions. Wrong
roles, missing/corrupt assets, scalar/array mismatch and malformed/excess/empty
references reject before uploads. Explicit duplicate references are preserved;
the adapter never adds a duplicate primary alias or silently deduplicates.

Existing Studio image_url + images_list redundancy is accepted only when the
primary equals the first array item (or exactly one item for scalar models).
Conflicting aliases and multi-image input to a single-image role reject. Identity,
composition/style, subject, character and view roles remain named in plans;
auxiliary mask/garment/watermark fields are not interchangeable generic references.

Plans expose `request.image`: semantic scope, canonical modelId, separate
providerModel, required inputs/media, array count/limit/order and providerRequest
endpoint/payload. effectiveOptions include verified catalog defaults. Registered
asset entries are logical placeholders with project-relative requiredUploads;
absolute paths remain transient inside trusted host processes. Plan/readiness
makes no credential lookup, upload, estimate, submission or polling call.
Authorization, fixed host transport, project storage and production state are
unchanged. Detailed input planning remains separate from static binding readiness.

### Layer results and honest remaining limits

Reviewed layer calls through generateI2I delegate to the existing **decomposeLayers**
helper. That helper retains its original default Pro endpoint and now also accepts
the exact reviewed Flash model. It validates the same request before using its
existing lifecycle. Confirmed result arrays come from images, output.images or
existing outputs fallback; a lone URL/empty list/object cannot impersonate a layer
list. The helper retains every returned metadata field and sets resultKind=layers.

Canonical result normalization requires this specialized helper result, emits all
images in provider order and marks resultKind=layers. It never collapses the list
to the first image. Returned top-level/nested identifiers, labels, masks or other
safe metadata remain in upstream if actually provided; no names/masks are
fabricated. Current published output schemas guarantee **only a list of image
URLs**. Front-to-back order, alpha guarantees, editable masks/names, per-layer roles,
base-image position and PSD-like reconstruction semantics are **UNVERIFIED**.
Preserving list order is not proof of stacking order. Flash metadata says separated
layers are PNG and output_format describes its base image; that is a declaration,
not a measured output guarantee. DECOMPOSE_IMAGE therefore remains partial for
rich editable-layer meaning, while its request/result transport is now explicit.

Topaz's nested output.image and Gemini's nested output.outputs are normalized
without losing original metadata/character IDs. No media is downloaded or registered
automatically. Source size/codec/pixel/duration/alpha and model quality are not
measured by URL validation or project checksums.

The branded face-expression-change endpoint's verified controls describe camera /
view transformations. No expression enum, skeletal pose, exact body motion,
identity lock or exact camera-preservation guarantee is advertised by this
contract. Unsupported expression/pose controls reject. Broader expression/body-pose
semantics and Qwen's conflicting view path remain partial/deferred.

### Evidence and QA scope

Read-only public inspection on 2026-10-26: [OpenAPI](https://api.muapi.ai/openapi.json)
request schemas for the 16 exact reviewed/deferred targets, plus
`GET https://api.muapi.ai/api/v1/models/{endpoint}` (15 successes; MiniMax alias
returned 404, but its exact execution path and fields are confirmed in OpenAPI).
Existing source supplied caps and semantic roles. No authentication, estimates,
uploads, provider execution or image generation occurred. Source schemas/public
metadata agree on Topaz engines and bounds; Qwen disagreement is explicitly
contained instead of generalized. No new image-provider catalog or contract
framework for unrelated models was introduced.

## Advanced video input contracts — 2026-10-26

**Reviewed request contracts:** 20 reference-guided I2V IDs, 11 keyframe I2V IDs,
and all 15 current Lip Sync catalog IDs. `videoInputContracts.js` projects the
existing Studio catalogs/capability schemas; it is an exact admission list, not
another discovery catalog. `i2v` still calls shared **generateI2V** and `lipsync`
still calls shared **processLipSync**, using their existing submit/poll/result
lifecycle. Desktop application calls delegate to those shared services for the
reviewed I2V subset and Lip Sync. No extra uploader/poller or provider is added.

The inventory below is the reviewed subset, not blanket certification of all 184
I2V entries. Other I2V models keep their existing path. Two reviewed candidates,
`kling-o1-reference-to-video` and `kling-o1-standard-reference-to-video`, are
**DEFERRED from canonical execution**: local catalog metadata requires images,
but workflow/reference metadata and nullable public media schemas allow a video
reference without images. This milestone does not manufacture image references
or decide that conflict. Legacy Studio access remains unchanged. Resolution,
Intl/Spicy or other profiles are not admitted by wildcard. No general V2V scope
is added through these I2V contracts; Seedance 2.5 Omni task types `edit`/`extend`
are rejected here (`auto`/`reference` only).

### Media, frames and project references

Every reviewed media field is typed and named in `getVideoInputMedia`; native
fields remain distinct. For example, Wan 2.7's optional `image_url` anchor does
not substitute for its image/video reference list. MiniMax reference image,
video and audio roles remain separate; Gemini voice/character identifiers are
opaque IDs, never project asset references. Single-source aliases are accepted
only for the model's actual role, and conflicting aliases reject.

Ordered image/video/audio project arrays reuse the bridge's existing asset
binding and project integrity machinery. Only declared reviewed media roles can
use arrays. Entries may mix registered asset IDs with public HTTP(S) URLs; order
and duplicates are preserved. Each registered entry must match its canonical
asset media type and project-relative identity and pass existing integrity
checks. Missing, malformed, empty required, oversized or role-mismatched input
rejects before authentication/upload/submission. Plans use logical placeholders
and project-relative requiredUploads, never transient absolute upload paths.
No media files or workflows are modified by assessment/planning/execution.

Reference counts come from existing model metadata, with existing workflow
combined constraints reused: Wan 2.7 image/video references total at most five;
MiniMax image/video/audio references total at most twelve, with a visual reference
required for official H3 while Open H3 permits audio-only reference input. Native
Gemini media fields are checked directly because workflow UI aliases differ.
Seedance 2.5 Omni requires at least one native image/video/audio reference.
No request is silently truncated, deduplicated or clamped by this contract.

Keyframes use the exact first/end fields or ordered `[start, end]` field required
by each model. Seedance 2/2.5 base first-last endpoints permit one start frame;
Seedance 2 fast and VIP base/fast retain the existing product's stricter two-frame
requirement (`endImageRequired`), even though public schema accepts one. Vidu
start/end and Flux require both frames. Gemini Flash requires first_frame_url
and permits an optional last_frame_url. Unrelated references cannot substitute
for a missing last frame. Identical start/end URLs are permitted and retained.
No interpolation quality, measured chronology or exact frame preservation is
inferred from URL positions.

### Lip Sync roles, controls and scope

Lip Sync validates the selected model's source type and audio before transport.
Portrait+audio models cannot accept video in place of the portrait; video+audio
models cannot accept an image instead of video. Prompt/resolution/seed are
accepted only where declared by the reviewed model. LTX keeps its existing
portrait product scope; audio-only generation allowed by a broader provider
schema is not newly exposed here.

Volcengine preserves `mode` (`lite`/`basic`), `separate_vocal`, scene detection
and Lite alignment/template controls. Scene detection cannot be enabled in Lite.
Explicit Lite-only alignment/template values reject in Basic, and their defaults
are omitted from Basic requests. Reverse audio alignment requires alignment.
`templ_start_seconds` is numeric 0–60, including fractions. `separate_vocal` is a
provider preprocessing setting, not a new stem-separation capability.
OmniHuman preserves native `output_resolution` (`720`/`1080`), `pe_fast_mode`
and integer seed; its mask array remains **UNVERIFIED/unsupported** because the
public schema does not establish safe mask/source association semantics.
No speculative duration, alignment or vocal options are accepted universally.

### Planning, parity and evidence

Plans add `request.videoInput`: exact logical model/mode, semantic capability,
required inputs, native media roles/counts/order, accepted controls/effective
defaults and intended provider endpoint/payload. Invalid requests return existing
structured diagnostics with a machine code and offending path. Input planning
is authoritative for detailed contract validity; whole-workflow readiness still
reports static binding availability and does not replace node input planning.
Plan/dry-run needs no credentials, upload, estimate, submission or polling.
Execution still requires existing authorization and project-handle checks.
Electron security, IPC, readiness semantics and production persistence are unchanged.

The only Video Studio change is a request-construction guard: do not inject a
fallback aspect ratio into a reviewed model that has no aspect control. No
layout/control or navigation changes were made. Native reviewed Seedance
resolution fields and Vidu Q4 audio references are preserved by the shared
contract even where the older catalog/UI under-declares them. UI-only reference
selection helpers retain their existing behavior; the strict service/canonical
boundary receives and validates supplied arrays without their truncating helpers.

**CONFIRMED evidence:** current Studio models, modelCapabilities, videoWorkflows,
Video/LipSync Studio request construction, shared/application services, bridge
and focused mocked tests. Public read-only inspection on 2026-10-26 used
[MuAPI OpenAPI](https://api.muapi.ai/openapi.json) request schemas for the source
candidates and all 15 Lip Sync endpoints, plus
`GET https://api.muapi.ai/api/v1/models/{endpoint}` for Lip Sync detail (14 successes;
`latentsync-video` detail returned 404, but its request path/schema exists in
OpenAPI). These are metadata GETs only, without authentication. Provider-required
fields and admitted control enums/bounds were compared against the projected
contracts. Product restrictions may deliberately be narrower. No credentials,
estimates, generation, uploads, agents or inference were used during QA.
Actual media format/duration constraints, output fidelity and provider success
remain **UNVERIFIED** by mocked tests. These contracts do not promise identity,
scene, camera, timing or exact pixel preservation.

### i2v exact reviewed inventory

| Logical ID / endpoint alias | Media roles | Accepted controls / defaults |
| --- | --- | --- |
| `vidu-q1-reference` | images_list [1–7] | prompt: string; aspect_ratio: ["16:9","9:16","1:1"] (default "1:1") |
| `seedance-lite-reference-video` → `seedance-lite-reference-to-video` | images_list [1–4] | prompt: string; resolution: ["480p","720p"] (default "480p"); duration: 3–12 (default 5) |
| `wan2.1-reference-video` | images_list [1–5] | prompt: string; resolution: ["480p","720p"] (default "480p"); aspect_ratio: ["16:9","9:16"] (default "16:9"); duration: 5–10 (default 5) |
| `vidu-q2-reference` | images_list [1–7] | prompt: string; resolution: ["360p","540p","720p","1080p"] (default "720p"); aspect_ratio: ["16:9","9:16","4:3","3:4","1:1"] (default "16:9"); duration: 2–8 (default 5); movement_amplitude: ["auto","small","medium","large"] (default "auto") |
| `vidu-q2-turbo-start-end-video` | image_url required; last_image required | prompt: string; resolution: ["720p","1080p"] (default "720p"); duration: 2–8 (default 5); bgm: boolean (default true); movement_amplitude: ["auto","small","medium","large"] (default "auto") |
| `vidu-q2-pro-start-end-video` | image_url required; last_image required | prompt: string; resolution: ["540p","720p","1080p"] (default "720p"); duration: 1–8 (default 5); bgm: boolean (default true); movement_amplitude: ["auto","small","medium","large"] (default "auto") |
| `kling-v3.0-omni-standard-image-to-video` | images_list [1–4] | prompt: string; aspect_ratio: ["9:16","16:9","1:1"] (default "16:9"); duration: [3,4,5,6,7,8,9,10,11,12,13,14,15] (default 5); generate_audio: boolean (default false) |
| `kling-v3.0-omni-pro-image-to-video` | images_list [1–4] | prompt: string; aspect_ratio: ["9:16","16:9","1:1"] (default "16:9"); duration: [3,4,5,6,7,8,9,10,11,12,13,14,15] (default 5); generate_audio: boolean (default false) |
| `kling-v3.0-omni-4k-image-to-video` | images_list [1–4] | prompt: string; aspect_ratio: ["9:16","16:9","1:1"] (default "16:9"); duration: [3,4,5,6,7,8,9,10,11,12,13,14,15] (default 5) |
| `seedance-2-omni-reference` → `seedance-2.0-omni-reference` | images_list [0–9]; video_files [0–3]; audio_files [0–3] | prompt: string; aspect_ratio: ["21:9","16:9","4:3","1:1","3:4","9:16"] (default "16:9"); quality: ["high","basic"] (default "high"); duration: 4–15 (default 5); resolution: ["480p","720p","1080p","4k"] (default "720p") |
| `wan2.7-reference-to-video` | images_list [0–4]; videos_list [0–4]; image_url optional | prompt: string; aspect_ratio: ["16:9","9:16","1:1","4:3","3:4"] (default "16:9"); resolution: ["720p","1080p"] (default "720p"); duration: 2–10 (default 5); negative_prompt: string |
| `seedance-2-first-last-frame` | images_list [1–2] | prompt: string; aspect_ratio: ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] (default "adaptive"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `seedance-2-first-last-frame-fast` | images_list [2–2] | prompt: string; aspect_ratio: ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] (default "adaptive"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `seedance-2-omni-reference-no-video` | images_list [1–9]; audio_files [0–3] | prompt: string; aspect_ratio: ["16:9","9:16","4:3","3:4"] (default "16:9"); duration: 4–15 (default 5) |
| `seedance-2-omni-reference-no-video-fast` | images_list [1–9]; audio_files [0–3] | prompt: string; aspect_ratio: ["16:9","9:16","4:3","3:4"] (default "16:9"); duration: 4–15 (default 5) |
| `seedance-2-vip-first-last-frame` | images_list [2–2] | prompt: string; aspect_ratio: ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] (default "adaptive"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `seedance-2-vip-first-last-frame-fast` | images_list [2–2] | prompt: string; aspect_ratio: ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] (default "adaptive"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `seedance-2-vip-omni-reference` | images_list [0–9]; video_files [0–3]; audio_files [0–3] | prompt: string; aspect_ratio: ["21:9","16:9","4:3","1:1","3:4","9:16"] (default "16:9"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `seedance-2-vip-omni-reference-fast` | images_list [0–9]; video_files [0–3]; audio_files [0–3] | prompt: string; aspect_ratio: ["21:9","16:9","4:3","1:1","3:4","9:16"] (default "16:9"); duration: 4–15 (default 5); high_bitrate: boolean (default false); resolution: ["720p","1080p","4k"] (default "720p") |
| `vidu-q3-pro-first-last-frames` | image_url required; last_image required | prompt: string; resolution: ["540p","720p","1080p"] (default "720p"); aspect_ratio: ["16:9","9:16","4:3","3:4","1:1"] (default "16:9"); duration: 1–16 (default 5); audio: boolean (default false) |
| `vidu-q3-turbo-first-last-frames` | image_url required; last_image required | prompt: string; resolution: ["360p","540p","720p","1080p"] (default "720p"); aspect_ratio: ["16:9","9:16","4:3","3:4","1:1"] (default "16:9"); duration: 1–16 (default 5); audio: boolean (default false) |
| `vidu-q4-reference-to-video` | images_list [1–15]; audios_list [0–3] | prompt: string; aspect_ratio: ["16:9","9:16","1:1","4:3","3:4"] (default "16:9"); resolution: ["540p","720p","1080p","2k","4k"] (default "720p"); duration: 3–16 (default 5); audio: boolean (default true) |
| `gemini-omni-image-to-video` | image_urls [1–7] | prompt: string; duration: [4,6,8,10] (default 8); resolution: ["720p","1080p","4k"] (default "1080p"); aspect_ratio: ["16:9","9:16"] (default "16:9"); audio_ids: array; seed: 0–2147483647 (default 0); character_ids: array |
| `seedance-2.5-first-last-frame` | images_list [1–2] | prompt: string; duration: 4–30 (default 5); seed: -1–4294967295; high_bitrate: boolean (default false); aspect_ratio: ["adaptive","16:9","9:16","1:1","4:3","3:4","21:9","9:21"] (default "16:9"); resolution: ["480p","720p","1080p","4k"] (default "720p") |
| `seedance-2.5-omni-reference` | images_list [0–30]; videos_list [0–10]; audios_list [0–10] | prompt: string; duration: 4–30 (default 5); aspect_ratio: ["adaptive","16:9","9:16","1:1","4:3","3:4","21:9","9:21"] (default "16:9"); seed: -1–4294967295; omni_reference_task_type: ["auto","reference"] (default "auto"); high_bitrate: boolean (default false); resolution: ["480p","720p","1080p","4k"] (default "720p") |
| `minimax-h3-reference-to-video` | reference_images [0–9]; reference_videos [0–3]; reference_audios [0–3] | prompt: string; aspect_ratio: ["21:9","16:9","4:3","1:1","3:4","9:16"] (default "16:9"); resolution: ["2k"] (default "2k"); duration: [5,6,7,8,9,10,11,12,13,14,15] (default 5) |
| `minimax-h3-open-reference-to-video` | images_list [0–9]; videos_list [0–3]; audios_list [0–3] | prompt: string; aspect_ratio: ["16:9","9:16","1:1","4:3","3:4","21:9","9:21"] (default "16:9"); resolution: ["480p","768p"] (default "480p"); duration: [5,6,7,8,9,10,11,12,13,14,15] (default 5); seed: integer (default -1) |
| `wan3.0-reference-to-video` | images_list [0–10]; videos_list [0–5]; audios_list [0–5] | prompt: string; resolution: ["480p","720p","1080p"] (default "720p"); aspect_ratio: ["adaptive","16:9","9:16","1:1","4:3","3:4"] (default "16:9"); duration: 2–30 (default 5); thinking_mode: boolean (default false); enable_audio: boolean (default true); seed: integer (default -1) |
| `flux-3-start-end-to-video` | image_url required; end_image_url required | prompt: string; aspect_ratio: ["16:9","9:16","1:1","4:3","3:4","21:9"] (default "16:9"); resolution: ["720p","1080p"] (default "720p"); duration: 5–20 (default 5); generate_audio: boolean (default true) |
| `gemini-omni-flash-1-1-image-to-video` | first_frame_url required; last_frame_url optional | prompt: string; duration: [4,6,8,10] (default 8); aspect_ratio: ["16:9","9:16"] (default "16:9"); resolution: ["720p","1080p","4k"] (default "720p"); seed: 0–2147483647 (default 0) |
| `gemini-omni-flash-1-1-reference-to-video` | image_urls [0–7]; reference_video_urls [0–3] | prompt: string; aspect_ratio: ["16:9","9:16"] (default "16:9"); resolution: ["360p","720p","1080p","4k"] (default "720p"); duration: 3–10 (default 8) |

### lipsync exact reviewed inventory

| Logical ID / endpoint alias | Media roles | Accepted controls / defaults |
| --- | --- | --- |
| `infinitetalk-image-to-video` | image_url required; audio_url required | resolution: ["480p","720p"] (default "480p"); prompt: string (default "") |
| `wan2.2-speech-to-video` | image_url required; audio_url required | resolution: ["480p","720p"] (default "480p"); prompt: string (default "") |
| `ltx-2.3-lipsync` | image_url required; audio_url required | resolution: ["480p","720p","1080p"] (default "720p"); prompt: string (default ""); seed: integer (default -1) |
| `ltx-2-19b-lipsync` | image_url required; audio_url required | resolution: ["480p","720p","1080p"] (default "720p"); prompt: string (default "") |
| `sync-lipsync` | video_url required; audio_url required |  |
| `latent-sync` → `latentsync-video` | video_url required; audio_url required |  |
| `creatify-lipsync` | video_url required; audio_url required |  |
| `veed-lipsync` | video_url required; audio_url required |  |
| `infinitetalk-video-to-video` | video_url required; audio_url required | resolution: ["480p","720p"] (default "480p"); prompt: string (default "") |
| `volcengine-video-to-video-lip-sync` | video_url required; audio_url required | mode: ["lite","basic"] (default "lite"); separate_vocal: boolean (default false); open_scenedet: boolean (default false); align_audio: boolean (default true); align_audio_reverse: boolean (default false); templ_start_seconds: 0–60 (default 0) |
| `kling-v1-avatar-standard` | image_url required; audio_url required | prompt: string (default "") |
| `kling-v1-avatar-pro` | image_url required; audio_url required | prompt: string (default "") |
| `kling-v2-avatar-standard` | image_url required; audio_url required | prompt: string (default "") |
| `kling-v2-avatar-pro` | image_url required; audio_url required | prompt: string (default "") |
| `omnihuman-1-5` | image_url required; audio_url required | output_resolution: ["720","1080"] (default "1080"); prompt: string (default ""); seed: integer (default -1); pe_fast_mode: boolean (default false) |
