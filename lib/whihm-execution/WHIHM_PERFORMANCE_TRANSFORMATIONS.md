# Performance transformation executor family — partial integration

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

## Higgsfield: stopped at native binding boundary

Three distinct deferred discovery entries record input documentation:

- [Motion Transfer](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/api-reference): source minimum4s, provider trims after30s,1–8 images, optional prompt max10000,480p/720p/1080p(default720p).
- [Object Swap](https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference): distinct endpoint, same reference/duration envelope, minimum409600 source pixels per frame.
- [Restyle](https://open.higgsfield.ai/models/higgsfield/genjutsu/restyle/v1.0/api-reference): preset_id required;0–5 references; source motion/composition/audio described as retained; provider may change cadence.

These are INPUT_DOCUMENTATION_ONLY, **not executable bindings**. The existing
remote bridge is MuAPI-only; no Higgsfield auth/upload/poll/continuation adapter
exists to reuse. The native protocol uses Key ID:secret and asynchronous requests;
its submission/status/result identity, uncertainty and host credential integration
still need a bounded reviewed adapter. This partial does not disguise native
Higgsfield as MuAPI or introduce another provider framework. All three entries
remain deferred with HIGGSFIELD_LIFECYCLE_BINDING_UNREVIEWED. No credentials or
provider probe is performed by discovery/planning. Their recorded input envelopes
do not claim input validation or execution support.

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

All provider execution is mocked. Public unauthenticated documentation/metadata
GETs only; no uploads, provider jobs, paid calls or runtime fidelity proof. Workflow
session state, invalidation and no-duplicate execution remain owned by the existing
engine. Source/dev availability does not establish packaged desktop readiness.
Projection:48 groups/616 entries (previous47/608),147 available reviewed,396 generic;
entries include intent views, not616 unique providers/models. New availability is
Spicy and its object view; four other object views reflect existing/deferred routes.

Next: implement the bounded native Higgsfield host adapter with explicit credential,
request identity, status/result and uncertainty contracts. Separately establish a
first-party Seedance guidance-input contract before enabling WHIHM-guided generation.
Paid comparison experiments remain a later explicitly authorized task.

QA:26 new cases;1396 unique targeted tests passed (1127 affected regressions,
243 workflow-core,26 new). Final syntax/ESLint passed for19 touched JS/MJS files.
Vite production build passed with its existing chunk-size advisory. git diff --check
passed. No dependencies, credentials, schemas, host/preload channels or runtime
binaries were changed. Local-only commit; no push or live provider execution.
