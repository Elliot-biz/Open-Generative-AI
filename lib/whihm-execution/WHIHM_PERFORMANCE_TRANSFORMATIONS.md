# Performance transformation executor family — native Higgsfield workflow integration

Canonical discovery now uses PERFORMANCE_TRANSFER, OBJECT_REPLACE_VIDEO and
VIDEO_RESTYLE. Integration does not establish which executor is best. No paid
benchmark, ranking, fallback, automatic retry or default selection was added.

## Bound execution

Existing canonical modes, executor IDs, typed media roles, host authorization,
asset verification, uploads and polling remain authoritative. Body Swap Studio
is a UI over Recast; it is not an additional executor.

| Executor | Intents and exact selector | Path / envelope |
| --- | --- | --- |
| kling-v3.0-pro-recast | PERFORMANCE_TRANSFER | Existing Kling Pro endpoint; one character image and driver video; optional prompt, character_orientation and keep_original_sound; orientation-dependent provider duration semantics retained |
| runway-act-two-recast | PERFORMANCE_TRANSFER | Existing Act Two image/performance route; one image, reference_video_url, aspect_ratio; no prompt or general object-replacement claim |
| wan2.2-animate-recast | PERFORMANCE_TRANSFER: mode=animate; OBJECT_REPLACE_VIDEO: mode=replace | Existing Wan endpoint; one image/video, prompt, 480p/720p; character replacement only, not universal editing |
| seedance-2.5-motion-control | PERFORMANCE_TRANSFER: mode=motion_transfer; OBJECT_REPLACE_VIDEO: mode=objects_swap | Managed provider preprocessing; 1–30 ordered images, 4–30s, output described as720p; aspect, seed, high_bitrate, generate_audio |
| seedance-2-motion-control | Same explicit intent selectors | Existing managed route; 1–9 images, 4–15s, quality high/basic, generate_audio; no seed/high_bitrate |
| seedance-2.5-spicy-motion-control | Same explicit intent selectors | Newly admitted distinct endpoint; same 2.5 schema; provider describes bolder treatment. No measured quality or preservation advantage is claimed |

Spicy was checked against [MuAPI OpenAPI](https://api.muapi.ai/openapi.json) and
[exact public metadata](https://api.muapi.ai/api/v1/models/seedance-2.5-spicy-motion-control)
on2026-10-28. Base and Spicy reference Seedance25MotionControlRequest. The existing
WHIHM policy requires at least one reference even though upstream permits omission.
The Intl variant remains deferred; shared schema is not implicit admission.

The same exact executor can serve multiple capabilities. Projection supplies a
separate view per intent, preserving model ID, endpoint and binding. Use the full
projection key when ID lookup is ambiguous. The view's exact_intent_parameters
constraint must be applied to the workflow request. Nodes may additionally declare
metadata.oga.intent; a conflicting declared intent rejects before dispatch.
Existing workflows without that declaration derive actual intent from their
validated request mode. This is a metadata addition, not a workflow schema change.
Older TRANSFER_PERFORMANCE/MOTION_CONTROL discovery groups are consolidated under
PERFORMANCE_TRANSFER. Execution modes recast/motion_control remain unchanged.

Plans/results record transformation intent, raw/direct versus managed preprocessing,
reference/duration envelopes and preservation caveats. Provider-managed processing
never claims a WHIHM guidance artifact. Usage is preserved only when natively
reported; cost null and cost0 remain different. Benchmark workflow evidence retains
this transformation metadata and native usage. Remote outputs continue through
existing normalization/publication/integrity boundaries; no provider-side undo or
trusted continuation rehydration is added.

## Higgsfield: bound through Workflow Execution

All three native routes are now reviewed/bound in the existing workflow adapter:

| Model | Canonical intent | Native envelope |
| --- | --- | --- |
| higgsfield/genjutsu/motion-transfer/v1.0 | PERFORMANCE_TRANSFER | 1–8 ordered reference images |
| higgsfield/genjutsu/object-swap/v1.0 | OBJECT_REPLACE_VIDEO | 1–8 ordered references; at least409600source pixels |
| higgsfield/genjutsu/restyle/v1.0 | VIDEO_RESTYLE | 0–5 ordered references; explicit preset_id |

All accept source video, optional prompt up to10000characters, and resolution
480p/720p/1080p(default720p). WHIHM accepts4–30seconds and rejects excess before
upload rather than letting the provider trim. These are provider envelopes and
intent statements, not measured performance or preservation guarantees.

Current first-party references:
[Motion Transfer](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/api-reference),
[Object Swap](https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference),
[Restyle](https://open.higgsfield.ai/models/higgsfield/genjutsu/restyle/v1.0/api-reference),
[uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads),
[request lifecycle](https://docs.higgsfield.ai/docs/concepts/requests).
These public sources were read without credentials, uploads or generation.

### Credentials and discovery

Set HF_API_KEY_ID and HF_API_KEY_SECRET in the trusted host environment. The
preserved native transport uses Authorization: Key ID:secret. Projection and
planning read local configuration only: HIGGSFIELD_CREDENTIALS_MISSING or
HIGGSFIELD_CONFIGURATION_INVALID blocks execution; valid configuration reports
available/reviewed with accountAccessVerified:false and runtimeVerification:unverified.
Readiness does not certify account access, credits, provider uptime or quality.
Built-in Node HTTPS supplies media transport; no storage service, runtime binary,
SDK, dependency or renderer credentials are introduced.

Three existing entries are promoted, with no new catalog rows:48groups/616entries.
With credentials absent:147available reviewed,396generic,38provider-blocked,
22deferred. With valid configuration:150available reviewed,35provider-blocked.
Native provider IDs remain opaque and never become project assets. Discovery
includes source/reference roles, constraints and same-session polling semantics.

### Canonical project inputs and workflow calls

Use remote-model executors with provider:higgsfield, the exact native model ID,
and metadata.oga.mode:performance_transformation (optional when the provider/model
are exact). A declared metadata.oga.intent must match the route. Use the existing
planWorkflowExecution/runWorkflow/resumeWorkflow/getWorkflowRun host APIs.
Single-node MuAPI planNode/executeNode remain separate; no provider-specific IPC
or new execution engine is introduced.

The source input port is video_url:type video with a {$asset:registeredId} value.
References use image_urls:type image/cardinality many with an array of asset
references. Restyle can omit references. Exactly one video output port is supported.
Unregistered URLs, arbitrary paths, missing references, wrong media types,
conflicting intent/mode, unknown controls and checksum mismatch reject before dispatch.
Existing workflow/project schema, graph dependencies and authorization remain intact.

The project adapter reuses Media Inspection, readBytes/hashBytes and the project
importer. Every source/reference is checked for registered identity, actual media
kind, supported MIME and bytes/checksum before upload; an aggregate64MiBinput cap
bounds memory. MP4 sources and PNG/JPEG/WebP/GIF images are admitted within existing
inspection limits. Planning inspects headers and local configuration, but never
uploads, submits, polls or creates output. Effective controls exclude placeholder
media URLs; normalized workflow inputs retain canonical asset identities.

### Provider handoff and identity

For each verified asset, POST the documented /files/generate-upload-url endpoint,
then PUT the verified bytes with returned allowlisted Content-Type/x-amz headers.
API credentials are sent only to the fixed API endpoint, never presigned storage
or output URLs. The public_url is passed to the preserved native submit method.
No upload retry, fallback or public file-sharing service is added. An ambiguous
upload stops before generation and does not automatically recreate provider state.
Known handoff identity survives failure as asset ID/checksum plus provider origin
and SHA256 reference fingerprint; signed URLs and storage headers remain private.

The preserved native adapter owns authentication, input validation, POST, UUID,
status URL and normalization. The project adapter adds a private session handle
bound to the owning project/root and exact native request UUID. Neither serialized
results nor benchmark records can create a trusted continuation session.

### Same-run continuation and uncertainty

queued/in_progress pause the same run as blocked/continuationRequired. Explicit
resumeWorkflow continuation:{nodeId,action:poll} performs one native status GET.
No scheduler, automatic polling loop, generic retry or second generation POST.
An interrupted poll with a known session can be explicitly polled again. Unknown
provider states remain unresolved. A submission without a confirmed native identity
is uncertain and cannot resume by submitting again. Generic approval is unchanged.

completed retrieves/validates/imports the output. failed/nsfw/canceled are terminal
provider outcomes and never register media; moderation is not a transport error.
A completed native result is retained privately when output retrieval fails, so
explicit continuation retries retrieval only. Once publication is attempted,
an uncertain importer outcome blocks rather than risking a duplicate import.
Run locks plus a session continuation lock prevent concurrent publication. Returned
snapshots are detached. Host/engine disposal clears private continuation state;
cross-restart recovery is not supported. Source/reference integrity is rechecked
before continuation. Input/executor changes use existing downstream stale semantics;
live/stale operations are not automatically restarted.

### Bounded output retrieval and publication

The narrowly scoped media helper uses Node HTTPS with normal certificate validation,
public IPv4 DNS checks and a pinned lookup result to prevent DNS rebinding. It
rejects credentials in URLs, non-HTTPS, custom ports, private/reserved addresses,
IPv6 literals and redirects. DNS and each transfer have bounded timeouts; responses
are capped at64MiB(JSON upload metadata64KiB). Requests inherit no provider headers
on storage/output transfers. IPv6-only or redirecting CDNs fail closed in v1.
No provider output is executed as code or interpreted as a local path.

Only positive-length video/mp4 bytes that pass existing Media Inspection as MP4
video reach a controlled private temporary file and immutable project import.
Inspection is header-based technical evidence, not full decoding or Creative QC.
The output checksum is independently compared with imported bytes; temporary data
is removed. Sources remain immutable; outputs have separate registered asset IDs.
A committed but unconfirmed import may leave an orphan asset; no successful run
output is accepted and no unsafe asset rollback/delete is attempted.

Registered metadata records schema/route version, provider/model/native UUID,
intent, source/reference IDs/checksums, input handoff fingerprints, normalized
controls, output reference fingerprint, submission time and native usage/cost.
The workflow output is a typed project asset with checksum, not a remote URL.
Benchmark run evidence retains that output, input/checksum bindings, exact route,
request UUID, attempt, intent and native usage/cost. Unknown remains unknown;
reported zero remains zero. No price estimates or rankings are produced.

## WHIHM prepared guidance: execution remains blocked

Reviewed Seedance Motion Control accepts a source video plus image references; its
contract does not declare a raw mask, depth/mesh guide or reviewed-artifact input.
Passing a composed preview as video_url would only assert ordinary video input,
not establish compatible conditioning or artifact-bound approval. Therefore only
raw mode is admitted here. face_mesh, depth_mask and depth_mask_face_mesh generation
consumption remain GUIDANCE_INPUT_CONTRACT_UNSUPPORTED. No guided executor is
advertised and no existing whole-clip review/checkpoint boundary is weakened.
The toolkit can still prepare/review artifacts and benchmark records can reference
them independently. No benchmark ACCEPT grants execution approval.

Source audio restoration remains an explicit separate FINISH_MEDIA
restore_source_audio operation with its existing runtime/integrity requirements.
No automatic chaining, Demucs, pitch policy, frame-rate policy or resolution recipe.

## Verification and next work

All generation/upload/download behavior is tested using explicit fixtures/mocks.
Tiny technical-header video fixtures are not proof of real encoded-media fidelity.
No real user uploads, Higgsfield generations, paid usage or quality comparisons
were performed. The existing Electron dependency-closure packaging blocker remains;
source/development availability is not packaged production certification.

Next: separately authorize a minimal native-provider runtime acceptance with safe
licensed fixtures, or complete local face-runtime acceptance. Paid comparative
benchmarking, ranking/fallback and WHIHM-guided Seedance remain separate work.

QA: 40 new mocked project/media/workflow integration cases; 695 unique targeted
tests passed, including native transport, transformation, workflow, benchmark,
projection/planning, host, MuAPI/Recast, guidance/segmentation and project-integrity
regressions. Syntax/ESLint passed for 11 touched JS/MJS files; git diff --check
passed. No renderer input changed, so no Vite/browser QA. Native lifecycle behavior was preserved; a tiny internal authorization-header hook
is shared with the media handoff to avoid duplicating credential semantics. No provider generation, real uploads or paid usage.
