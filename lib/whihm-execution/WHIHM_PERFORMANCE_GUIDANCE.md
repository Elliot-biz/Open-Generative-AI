# Performance Guidance Toolkit v1 — bounded, runtime-constrained foundation

Current update: [Meta remote subject segmentation](WHIHM_REMOTE_SEGMENTATION.md) is now
reviewed/bound. Explicit `mode:subject_mask` produces a registered binary PNG sequence;
composition consumes it through the existing pipeline. Missing Meta configuration
remains provider-blocked, and live-provider/real-FFmpeg fidelity remains unverified.
The initial stop/QA evidence below is historical; no second provider framework or
local heavy inference was added to resolve it.

**Initial milestone evidence (before the Meta binding):** this milestone was **PARTIAL**: preparation, local face-extraction implementation,
composition, artifact/review records, workflow integration and soundtrack restoration
are implemented. **Remote subject segmentation remains unbound/provider-blocked.**
No SAM runtime, Python environment, PyTorch, CUDA or heavy desktop vision model is
required. No generation executor, paid experiment, automatic quality judge, ranking,
fallback or agent is introduced. The existing Workflow Execution and Performance
Benchmark foundations remain authoritative for execution and evaluation respectively.

## Canonical surface and artifacts

- `PREPARE_PERFORMANCE_GUIDANCE` / `prepare_performance_guidance` /
  `performance-guidance`: prepare a registered video using explicit references.
- `EXTRACT_FACE_GUIDANCE` / `extract_face_guidance` / `face-guidance`: the same
  implementation restricted to `face_mesh`.
- `SEGMENT_VIDEO_SUBJECT` / `segment_video_subject` /
  `video-subject-segmentation`: reviewed Meta sam-3.1 host binding, request mode
  `subject_mask`; static configuration/readiness and binary sequence output are
  documented in the remote-segmentation contract.

Modes are `face_mesh`, `depth_mask`, `depth_mask_face_mesh`. Public preparation
accepts `assetId`, `mode`, optional `depthAssetId`/`maskAssetId`, and `parameters:{}`.
Unknown parameters, paths, URLs, selectors, commands and backend overrides reject.
All sources are registered, immutable project assets checked through the existing
project integrity/boundary helpers. Plans read headers and local configuration but
never run inference, FFmpeg, provider jobs, uploads or output creation.

Version-1 definitions contain source and reference IDs/checksums, mode and explicit
operation parameters. Canonically sorted SHA256 definitions exclude timestamps and
review observations. Each completed record has a unique guidanceId, definitionHash,
source, immutable artifacts, artifactDigest, timeline, backend identity, objective
validation, timestamps and review history. The preview is a separate registered MP4;
face modes also register a versioned JSON landmark/tessellation artifact. Asset
metadata retains source, parent IDs/checksums, recipe, backend and exact timeline.
No global provenance graph or canonical workflow/project schema change is added.
Publication uses existing immutable imports. If a later import fails after an earlier
one committed, an unreferenced project asset can remain; no successful guidance
record or approval is accepted. There is no unsafe asset rollback/delete behavior.

## Local face guidance

One direct production dependency is added: **@mediapipe/tasks-vision 0.10.32**,
exact-pinned by package-lock integrity, approximately **23.6 MB unpacked**, with no
new transitive packages. Its JS/WASM runs locally in a hidden, sandboxed Electron
utility renderer: no Node integration, application preload, application IPC,
permissions or network. A private per-operation custom protocol serves only the
in-memory allowlisted package files, model and staged PNG frames; file/HTTP(S) and
unknown paths are denied. The renderer is destroyed after completion/failure or a
120-second deadline. No existing Studio/Audio UI or Vite input changes.

A trusted host administrator must explicitly stage a compatible Face Landmarker
`.task` file and set **WHIHM_FACE_MODEL_PATH** and **WHIHM_FACE_MODEL_SHA256**.
The model must be a regular file, at most 10 MiB, with that exact SHA256. No model
is bundled, selected by latest-version lookup or downloaded during execution.
Readiness reports missing configuration, missing/invalid assets, checksum mismatch,
package-version mismatch or unavailable Electron runner. It never exposes model
paths. Readiness means staged/configured; actual inference remains unverified here.
The expected model produces 478 landmarks. A wrong/incompatible task fails closed.

The pinned runner uses `VIDEO` mode and CPU delegate with detection, presence and
tracking thresholds explicitly 0.5. It asks for at most two faces so a second
face rejects; the supported result is exactly one face per frame. Missing frames
are reported and the preparation fails; no interpolation or invented points is
performed. Results preserve frame index/timestamp and finite normalized x/y with
relative z, plus the pinned library's tessellation connections. These coordinates
are not calibrated geometry. Tracking identity through crossings/occlusion is not
certified. This is a bounded implementation choice, not a universal preservation
policy or automatic acceptance criterion.

Reference: [Google's web Face Landmarker contract](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).
The dependency contains runtime code/WASM, not the required task model. A future
packaged build must include the pinned dependency assets and guidance source closure,
and stage an explicitly reviewed model/hash through trusted configuration. The
existing Electron dependency-closure shipping blocker is not repaired; Windows and
packaged inference are not certified. No Python sidecar or installer is introduced.

## Segmentation boundary and supplied masks

Current binding: see [remote segmentation](WHIHM_REMOTE_SEGMENTATION.md). The
following paragraph records the **initial** unapproved-backend boundary, now resolved
by the explicitly approved bounded Meta binding:

The current OGA/MuAPI bindings provide background matting, not a reviewed raw-mask
endpoint with explicit subject selection and temporal-mask evidence. The inspected
[SAM video schema](https://replicate.com/lucataco/sam3-video/api/schema) offers raw-mask
output on a different provider lifecycle. Adding that provider framework would cross
this task's stop boundary, so **no segmentation backend is selected or implemented**.
At that initial milestone no point/box/initial-mask support was admitted. The current
Meta binding supports box/point/concept prompts; initial-mask support and local SAM
fallback remain absent.
A future reviewed binding must own selector semantics, request lifecycle, raw-mask
retrieval and provider evidence through the existing remote architecture.

For useful composition now, the caller may supply an already registered grayscale
mask video. It is explicitly a **supplied reference**, not a WHIHM segmentation
result. Every decoded frame is checked for dimensions, grayscale channels and
occupancy. Intensity >=128 defines foreground for occupancy statistics: empty frames
reject; full and >=98% near-full occupancy are reported as technical observations,
not subjective quality or background-spill judgments. Source/subject correctness
still needs human review. No network fetch/import occurs implicitly.

## Existing Depth and deterministic composition

Depth references use **the existing `depth-anything` / `depth` route**. The toolkit
imports its current input description and accepts a registered output reference;
it never submits a second depth implementation or silently starts a paid operation.
An explicit existing Depth node/operation and deliberate project registration can
provide that reference. The toolkit does not attest supplied-reference provider
provenance, metric distance, calibration, segmentation or depth fidelity. The existing
image/video XOR contract and result behavior remain unchanged.

The existing paired FFmpeg resolver/lease and bounded process helper are reused.
`WHIHM_MEDIA_FINISHING_BASELINE_V1` retains all **29 required** checks. Seven narrowly
scoped **optional** observations are added: ffmpeg PNG decoder/encoder, format,
maskedmerge, overlay filters, and image2 muxer/demuxer. There are now 28 optional
checks. New `WHIHM_PERFORMANCE_GUIDANCE_V1` readiness requires the finishing baseline
and all seven guidance features; missing guidance features never disable existing
image or video/audio finishing.

v1 accepts one zero-rotation, square-pixel H.264 stream in nonfragmented MP4/MOV,
constant sample deltas, positive even dimensions, 1–120 fps, at most 600 frames,
2,073,600 pixels/frame and 134,217,728 total pixels. These are resource bounds, not
universal creative resolution/fps policy. Header frame count is now an additive
Media Inspection fact. Source duration must match frame-count/rate; all supplied
videos must match the canonical timeline. Variable timing and edits/offsets that
cannot satisfy zero-based decoded timestamps reject.

FFprobe verifies **every decoded frame** against expected index/time/dimensions
before composition and again on the output. Timestamp serialization tolerance is
0.001 ms (one microsecond); header frame-count/rate/duration and dimensions must
match. PNG extraction uses passthrough timing, not an fps/retiming filter. Staged
files/output and captured diagnostics are bounded, commands use argument arrays,
shell=false, file-only protocols, no external movie references, and fresh runtime
identity checks. Temp directories are removed on success/failure/timeout; a failed
process or output verification cannot produce an accepted guidance record. These
are logical bounds/deadlines, not hard OS memory/disk quotas.

Composition has a fixed documented encoding:

- `depth_mask`: source RGB background, depth RGB foreground, using the mask's
  grayscale intensity as continuous alpha via maskedmerge. No semantic crop/repair.
- `face_mesh`: green one-pixel tessellation over source, transparent elsewhere.
- `depth_mask_face_mesh`: that same mesh over the depth-mask composite.

Output is separate silent MP4, software libx264 lossless CRF0/yuv444p, no preserved
metadata/audio, exact input frame count and passthrough timing. RGB/YUV conversion
and runtime versions remain part of reproducibility; no cross-platform byte identity
or perceptual fidelity guarantee is implied. PNG/landmark work reuses existing Sharp,
not OpenCV. Current actual runtime remains **missing / MM_PAIR_ABSENT**. Real FFmpeg
composition and real MediaPipe inference are **runtime-unverified**; tests clearly
use fake processes/header outputs and mocked inference, alongside real Sharp PNG
composition/inspection. No model was downloaded or real video transform executed.

## Whole-clip review and existing workflow approval

Fixed host/preload APIs are `planPerformanceGuidance`, `preparePerformanceGuidance`,
`getPerformanceGuidance`, `reviewPerformanceGuidance`. Prepare/review each require
`allowExecution:true`; plans/reads never authorize execution. Requests use the existing
project handle and trusted-sender allowlist. Canonical records expose logical paths,
never absolute machine paths, credentials or trusted run continuation state.

Review requires `origin:'human'`, `coverage:'whole_clip'`, exact `artifactDigest`,
reviewer, decision (`reviewed`, `issues`, `rejected`), optional notes/issues. Evidence
includes exact source/artifact checksums, reviewId and timestamp. This is a human
**declaration**, not proof of watching, authentication, automated QC or an approval.
A still/contact-sheet alone cannot satisfy the whole_clip declaration. Only a latest
`reviewed` declaration is eligible for the subsequent workflow checkpoint.

Use an existing `control` / `approval` node with a required **JSON input named
`guidance`**, bound to the preparation node's JSON result. The adapter verifies the
owning session's record/review and asset integrity, then supplies an artifact binding.
The existing `approveWorkflowCheckpoint` API records the human decision; it never
approves automatically. The engine additionally binds that approval to the exact
artifact digest and reviewId, checks it at approval/resume and before each new
node dispatch, and marks checkpoint/descendants stale if evidence changes. Core
approval machinery remains authoritative. Unaffected branches retain their state;
stale nodes require existing explicit rerun/invalidation semantics.

The workflow author must include this checkpoint before later generation. No new
generation executor consumes guidance in this milestone, and the toolkit does not
claim to gate unrelated arbitrary workflows automatically. Benchmark ACCEPT is
never accepted as review/approval. Suno liveness remains a different provider boundary.

Guidance sessions/approved bindings are project-host/session scoped. Lost sessions
fail closed; returned JSON is audit/evaluation data, never trusted continuation
state. No durable run/review rehydration or cross-restart persistence is added.

## Workflow, benchmark and soundtrack reuse

Utilities `performance-guidance` and `face-guidance` dispatch through the existing
DAG adapter; required source/depth/mask inputs are typed video/project bindings.
JSON outputs expose the compact record; a video output exposes its registered preview.
Existing dependency discovery and hashing invalidate descendants on source/reference,
checksum or mode changes. No alternative executor, retry or workflow engine is added.
The existing benchmark can reference the registered preview/output and its checksum
as a candidate/reference variant without any new mandatory benchmark metric set.
It does not execute experiments, judge quality, rank or authorize execution.

Existing FINISH_MEDIA gains **restore_source_audio**. Standalone parameters are
`{sourceAudioAssetId,container:'mp4'|'mov',videoCodec:'h264',audio:'preserve',audioCodec:'aac',audioBitrate?}`.
The donor is an explicit separate registered AAC video/audio or PCM16 WAV source,
mono/stereo at an existing supported sample rate. Its audio duration must match the
video stream within one microsecond. No padding, hold, trim, shift or `shortest`
policy is guessed. Video is stream-copied; the selected soundtrack is encoded as AAC
(default128000 bps, explicit bitrate allowed). Existing finish verification checks
container/codec/duration/dimensions/audio/rate/channels before registration and records
both parent checksums. Plans remain useful while runtime-blocked. In workflow nodes,
use an explicit typed `sourceAudioAssetId` port so dependencies/checksums stay visible.
No Demucs, stems, pitch policy, mixing or full Audio Production is added.

## Discovery and next boundary

Projection/planning remain schema1, dynamically deriving **47 groups /608 entries**
(previously44/605), **142 available reviewed**,396 available generic,35 provider-blocked,
22 deferred,13 local-constrained,608 runtime-unverified. Two new reviewed contract
entries remain execution/runtime-gated; the third is a blocked segmentation descriptor.
Planning context has no guidance-specific registry or branch and carries no full
landmark payload in its overview. Image finishing and all prior model admissions stay
unchanged. No FFmpeg creative capability is added.

The remote raw-mask binding has now been added. Next, stage the pinned face model and run local acceptance with an approved
multimedia pair. Only after actual whole-clip review should a later executor
integration compare Higgsfield Genjutsu, MuAPI Seedance/Kling Motion Control,
Runway Act Two, Wan Animate or open-guided Seedance paths. This milestone supplies
the toolkit, not those generation integrations, benchmarks or policy/default choices.


## Verification for this implementation

**81 new tests**:80 focused guidance cases and one fixed preload/host integration
case. **1,115 unique targeted tests pass**:872 execution/guidance/host/projection/
planning/inspection/finishing/runtime/Depth/Suno/video/bridge cases plus243 workflow-core
cases. Successful video/inference paths are explicitly fixture-backed, not live
acceptance evidence. All26 touched JS/MJS files pass syntax and ESLint; git diff
--check passes. No user-facing renderer/Studio build input changes, Vite/build,
browser QA, provider jobs, real uploads, model downloads or FFmpeg installation.
The isolated utility renderer's permissions/network/timeout behavior is fixture-tested;
real Electron/WASM/model acceptance remains a required follow-up.
