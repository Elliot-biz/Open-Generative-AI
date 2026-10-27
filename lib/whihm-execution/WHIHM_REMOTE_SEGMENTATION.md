# Remote video subject segmentation v1

`SEGMENT_VIDEO_SUBJECT` is now reviewed/bound to Meta's hosted **sam-3.1** as its
first implementation. Canonical tool `video-subject-segmentation` and mode
`segment_video_subject` remain provider-neutral. Meta/model identity is binding
metadata, not a creative capability name. No local SAM, Python, PyTorch, CUDA,
OpenCV, new multimedia stack or generic provider framework is introduced.

The fixed host/preload surface is unchanged. A segmentation request is explicit:

```js
const request = {
  projectHandle, assetId: 'registered_source_video', mode: 'subject_mask',
  objectId: 'performer_main',
  selector: { type: 'box', frameIndex: 0, x1: 10, y1: 20, x2: 99, y2: 199 },
};
await window.whihmHost.planPerformanceGuidance(request);
const result = await window.whihmHost.preparePerformanceGuidance({
  ...request, allowExecution: true,
});
```

Existing getPerformanceGuidance/reviewPerformanceGuidance retrieve compact records
and record human review. They do not return giant mask rasters by default. Registered
mask artifact bytes are project data, not trusted provider/workflow continuation state.

## Contract and binding

Three selector types are supported:

- `box`: integer frameIndex and inclusive source-pixel x1/y1/x2/y2. A one-pixel box
  is valid; coordinates must be inside the displayed, unrotated source.
- `point`: integer frameIndex plus an ordered `points` array,1–32 entries of
  `{x,y,label?}`. Label is `positive` (default) or `negative`; at least one positive
  point is required. Negative-only objects and unknown fields reject.
- `concept`: one nonblank bounded `prompt` string. No prompt/token mixing or
  invented initial-mask support. v1 accepts one matched subject; multiple matches
  return SEGMENTATION_MULTIPLE_MATCHES_NEED_SELECTION instead of picking an object.

Canonical objectId defaults to `subject` and remains independent of the provider ID.
For location prompts the binding explicitly requests provider object1. Concept
responses retain the sole returned ID, including sparse/nonzero IDs. Identity is
within a response/source-linked artifact, not global person re-identification.

For box/point prompts, frame0 defaults to **forward**, a later frame to **both**.
Explicit `both` is supported; explicit `forward` requires frame0. Partial/backward
tracking remains deferred: v1 must cover the whole clip and cannot label unrequested
frames absent. Concept tracking covers the clip and takes no direction override.
This is a WHIHM scope restriction, not a claim that Meta lacks backward tracking.

Input remains within the guidance contract: registered, checksum-verified CFR
H.264 MP4/MOV, zero rotation/square pixels, existing frame/pixel limits. The binding
adds a16 MiB source-byte bound and requires correct MP4/QuickTime MIME declaration.
These are WHIHM v1 resource limits; they do not describe Meta's maximum service limits.
URLs, paths, executable arguments, custom endpoints/models and raw provider payloads
are not accepted from host callers.

Trusted Node/Electron configuration uses **WHIHM_META_API_KEY**. Optional
WHIHM_META_BASE_URL must be exactly `https://api.meta.ai/v1`; no arbitrary endpoint,
redirect or authentication fallback is allowed. There is no MuAPI/MODEL_API_KEY
fallback or new credential UI. Missing/malformed configuration produces static
provider-blocked readiness. Reads inspect configuration only, never authenticate,
upload, probe account access or contact Meta. A configured key is not health/model
access proof; provider runtime/fidelity remain unverified.

Execution makes exactly one Node fetch POST to `https://api.meta.ai/v1/responses`,
model sam-3.1, `stream:false`, mask_encoding one_bit. Source bytes become a data URL
only after authorization and integrity checks. The documented non-streaming result
avoids another event/polling/orchestration framework. No Files API, SDK, webhook,
private listing, job manager, auto retry or fallback is added. Requests have a
five-minute abort deadline and32 MiB response bound. Redirects reject; errors expose
codes and safe identities, not bodies, credentials or uploaded bytes. Incomplete,
malformed, refused and wrong-model responses never become accepted masks. Unknown
transport outcomes remain blocked/uncertain so workflow resume cannot duplicate jobs.

## Parsing, masks and objective validation

New direct dependency **@meta-sam/parser 0.1.0**, exact-pinned by lock integrity,
is128,572 bytes unpacked and has **zero runtime dependencies**. No OpenAI SDK,
graphics/video/react package or local inference runtime is added. It supplies the
prompt builder, video format parser and mask decoder; the binding does not duplicate
its arithmetic/base85 codec. Source dimensions, encoded dimensions, output bytes and
aggregate raster area are bounded before the official intrinsic decoder runs.

The canonical sequence has schemaVersion1 and kind `subject-mask-sequence`, registered
as `application/vnd.whihm.mask-sequence+json`. It contains source ID/SHA256, normalized
selector/direction/object identity, timeline, provider/parser and Sharp writer identity,
request ID, native usage, objective validation, and frame-indexed records. Each frame
contains explicit index/timestamp, canonical/provider IDs, present flag, half-open box
when returned, source dimensions, and a checksummed lossless PNG encoded as base64.
Box and mask confidence are retained separately when provided; missing is not zero.

Frame markers, never output position, determine alignment. The timestamp schedule
is based on the existing source-header CFR contract; decoded source-timing proof
occurs later in composition, and is not claimed by the remote-only mask result. Out-of-order frames are
sorted by source index. Only a completed valid output-text lane can supply absent
frames: provider omission becomes present=false and a deterministic all-black PNG.
No landmarks/detections are invented, interpolated or predicted locally. Conflicting
duplicate frame/object records reject; identical duplicates may be coalesced. Masks
are decoded in their returned box and placed at exact source coordinates, without
stretching/resampling. Raster/box/source dimension mismatch rejects.

PNG pixels are exactly black0/background or white255/subject. PNG sequences preserve
source dimensions, count and CFR timestamps without needing FFmpeg. An empty lane or
all-empty masks is a successful `outcome:no_match` with SEGMENTATION_NO_MATCH; it is
neither transport failure nor a fabricated subject. Composition rejects no-match
input. Empty/full/near-full (>=98% occupancy) frames are technical observations, not
quality scores or semantic background-spill judgments. Supplied sequences additionally
validate source/checksum, PNG identity/dimensions/single-frame envelope, canonical
frame alignment and binary pixels before composition accepts them.

Native Responses ID is retained as requestId; a safe HTTP request ID is retained on
failures when available. These IDs are opaque evidence, never assets or resumable
trusted operations. Native usage is preserved when returned (including zero), with
reported-frame counts clearly separated from billing usage. This reviewed API does
not supply a documented monetary billed-cost field: `cost:null` means **unknown**,
never zero. No pricing table, estimate, dollar calculation or cost ledger is added.
Benchmark aggregation therefore remains incomplete when monetary evidence is absent.

## Guidance, workflow, review and benchmark

An explicit segmentation node may produce a typed **file** output. Downstream
`performance-guidance` nodes bind it to `maskAssetId` (type file), alongside source
and an existing registered Depth result. Both depth_mask and depth_mask_face_mesh
consume the sequence; supplied mask videos continue to work. Neither composition
mode implicitly submits segmentation. Existing depth-anything/depth behavior is
unchanged; no new depth request/provider implementation exists.

Workflow nodes use executor.type utility and tool video-subject-segmentation, with
mode subject_mask and the selector parameters. This is the specialized remote host
route, not a MuAPI model/executeNode alias. Optional executor provider/model assertions
must match meta/sam-3.1; no substitution occurs. The coordinator retains native result,
usage/request identity, normal typed dependencies, readiness, authorization and
same-session trust/uncertainty semantics. Source/checksum, selector, executor or output
changes use existing deterministic descendant invalidation. No retry, fallback,
provider choice or new workflow schema is added.

Composition stages sequence PNGs through the **same** multimedia resolver/lease and
reviewed image2 path. No new feature checks are required beyond the existing guidance
profile. Absent frames are allowed to stay black only when explicitly represented
as absent in the sequence; legacy mask-video empty-frame behavior is unchanged.
Source/depth and final output decoded timestamps remain independently verified.
Current actual multimedia runtime is still missing/MM_PAIR_ABSENT, so real FFmpeg
composition remains gated and unverified. Raw mask materialization itself works
without that runtime; it does not claim to return a mask video.

Composition review evidence/digest now explicitly include **parent depth and mask
asset checksums** as well as generated outputs/source. Existing whole-clip human
review and the generic artifact-bound workflow approval remain distinct actions.
Changed mask/artifact/review evidence cannot inherit an earlier authorization; stale
nodes do not auto-regenerate. Benchmark ACCEPT is never execution approval or Suno
provider liveness. No serialized guidance/benchmark data rehydrates trusted runs.

Benchmark records accept this one registered file MIME in addition to existing media.
Raw masks and composed guidance can be case references/candidate outputs, and recorded
workflow evidence preserves native usage and unknown cost. Arbitrary file types remain
rejected. No benchmark experiment, automatic judge, ranking or recommendation is added.

## Discovery, verification and next boundary

Projection/planning remain schema1 with **47 groups /608 entries**. The prior blocked
placeholder is now reviewed/statically bound. With no Meta key it remains provider-blocked
(142 available reviewed,35 provider-blocked); a syntactically configured key makes it
contract-available (143/34), while runtime remains unverified. Static configuration
reads perform no transport. Selector, opaque-ID, raw-sequence and specialized routing
metadata derive through the existing projection; planning-context code is unchanged.

QA uses realistic official-codec fixtures, mocked HTTP and existing fake multimedia
processes, alongside real Sharp PNG encoding/validation and project registration.
No live/provider/paid execution, real upload or benchmark experiment occurred. No
real Meta mask-fidelity, account/model-access or real FFmpeg acceptance is certified.
Public first-party docs and npm package reads/install were the only network work.
Face/Depth/Suno behavior, shipping dependency-closure blocker and session persistence
limitations remain unchanged. No packaging/renderer/UI work was added.

Next: staged-runtime local acceptance of guidance composition and explicitly authorized
remote acceptance only in a later task; generation-executor/Genjutsu integration and
actual performance comparisons remain separate milestones.

Sources: [Meta request/selectors](https://dev.meta.ai/docs/sam/segmenting),
[wire/frame semantics](https://github.com/meta-models/meta-sam/blob/main/protocol/sam3.md),
[official parser](https://dev.meta.ai/docs/sam/client-libraries).

QA result: **93 new tests** (92 segmentation cases plus one fixed host/preload case);
**951 unique targeted tests pass** (708 extension/host/contract cases plus243 workflow
core cases). All16 touched JS/MJS files pass syntax and ESLint; git diff --check passes.
New inference/transport successes are mocked. PNG decoding/encoding/registration are
real local operations; video composition uses explicitly identified fake runtime
processes. No renderer/build inputs changed, so no Vite/browser QA ran. Submodules and
the known excluded history file are untouched.
