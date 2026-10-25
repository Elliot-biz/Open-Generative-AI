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
current source entries and documents why only nine are admitted now:

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
