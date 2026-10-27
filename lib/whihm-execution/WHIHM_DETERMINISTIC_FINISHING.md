# Deterministic Finishing v1 — image, video and audio

Guidance addendum: [Performance Guidance Toolkit](WHIHM_PERFORMANCE_GUIDANCE.md)
adds restore_source_audio to existing video finishing: explicit registered soundtrack,
strict duration match, video stream copy and AAC mux, verified/imported through the same
finishing path. Workflow nodes require a typed donor port. No pitch/stems/mixing policy.
The existing image and other video/audio operations retain their prior behavior.


Capability **FINISH_MEDIA**, local mode **finish_media**, tool **media-finishing**.
Images use the existing Sharp worker. Bounded video/audio operations now use the
[paired multimedia runtime](WHIHM_MULTIMEDIA_RUNTIME.md) only through a fresh
**WHIHM_MEDIA_FINISHING_BASELINE_V1** ready execution lease. Missing, partial,
incompatible or unverified runtime blocks execution; image finishing stays available.
No provider, workflow orchestration, UI, dependency, binary or packaging change.

Current source/development environment: **missing / MM_PAIR_ABSENT**. Typed contracts,
command construction, process failure/cleanup and header-verification/publication
boundaries are fixture-tested. **Real FFmpeg transform acceptance, decoding and
pixel/sample fidelity are runtime-unverified**, not simulated evidence of real
transcoding. No installation was attempted. This bounded implementation covers all
three media kinds but does not claim packaged production readiness.

## Original image-milestone tooling gate (historical)

The checkout/environment has no app-supported FFmpeg/ffprobe binary, discovery,
version policy or packaging contract. Wan2GP's internal Python children are not
an application-wide media-transform backend. Adding a hard binary dependency
would require source/dev and Windows/Electron deployment decisions outside this
milestone. **At that historical image-only milestone, all video/audio transforms remained deferred**, including trim, fades,
gain, loudness, fps, codec/container conversion and sample-rate/channel conversion.
No primitive is advertised as implemented merely because inspection can read headers.

Images reuse existing Next/Sharp/native libraries; no package manifest, lockfile,
dependency, download or binary changed. Node `worker_threads` runs a fixed source
module, with only bytes/typed parameters. Existing Electron source-closure packaging
omission remains a separate high-severity shipping blocker. Source/development use
requires existing Sharp/native modules and Node/Electron worker support; packaged
production readiness is not claimed.

## Operations and request

```js
const request = {
  projectHandle,
  assetId: 'registered_image',
  operation: 'resize',
  parameters: { width: 1280, height: 720, fit: 'cover', outputFormat: 'png' },
};
await window.whihmHost.planMediaFinishing(request);
await window.whihmHost.finishMedia({ ...request, allowExecution: true });
```

Image operations support single-page PNG/JPEG/WebP/GIF/TIFF inputs; PNG/JPEG/WebP output. Animated/multi-page
inputs reject instead of silently discarding frames. EXIF orientation is applied
first; all coordinates/dimensions refer to upright display pixels.

| operation | Required geometry | Behavior |
| --- | --- | --- |
| resize | width, height, fit=fill or cover | Exact output size; fill may distort; cover uses deterministic centre crop |
| crop | left, top, width, height | Nonnegative integer origin; crop must fit known upright source bounds |
| contain | width, height, background | Exact canvas with centred contain/pad; background must be explicit #RRGGBB or #RRGGBBAA |
| convert | none | Changes encoding/container; preserves upright source dimensions |

All operations require caller-selected `outputFormat`. Unknown/cross-operation
parameters reject. Dimensions are positive integers at most 8192; source/output
pixel area at most 16,777,216; output bytes at most the existing 64 MiB import bound.
These are resource bounds, not quality thresholds. No silent clamping, semantic
crop position, AI upscaling or automatic platform profile is used.

Encoding controls:

- PNG: compressionLevel 0–9, default 6; non-paletted, non-progressive, adaptive
  filtering off. `quality` is unsupported rather than silently ignored.
- JPEG/WebP: quality 1–100, default 80, matching the existing writer default.
  JPEG is non-progressive with 4:2:0 chroma and mozjpeg off; WebP is lossy/effort 4.
- JPEG requires explicit opaque `flattenBackground` (#RRGGBB) when source alpha is
  present or unknown. Transparent contain backgrounds reject for JPEG. Other writers
  reject flattenBackground. Source transparency is not silently discarded.
- `metadata`: strip/default or preserve. Strip uses Sharp's standard sRGB behavior
  and removes metadata. Preserve invokes keepMetadata for format-supported tags;
  potentially sensitive EXIF/XMP/GPS may remain by explicit caller choice. EXIF
  orientation/dimensions can be corrected. Tag-by-tag fidelity is not certified.

The fixed resampling kernel is lanczos3. Defaults are technical writer settings,
not quality recommendations. No fps, bitrate, codec, audio or max-size targeting
controls exist in the image contract. Low-level image dimensions/format/compression are reusable by a
later Delivery Presets layer; no preset library is added here.

## Video/audio operations and export contract

Requests retain the same host shape shown above. Media kind is derived from the
registered asset and inspected bytes, never overridden by a caller. Operation and
parameter schemas live in [multimedia-finishing-contract.mjs](multimedia-finishing-contract.mjs).
Unknown fields, cross-operation controls and raw args/filtergraphs/paths reject.

Video common required parameters: `container: mp4|mov`, `videoCodec: h264`,
`audio: preserve|remove`. When preserving an existing audio stream, `audioCodec: aac`
is required; optional integer `audioBitrate` is 16,000–320,000 bps, default 128,000.
For silent sources preserve keeps silence; audioCodec/audioBitrate then reject.
Remove rejects audio codec/bitrate controls. Optional integer `videoBitrate` is
10,000–100,000,000 bps. It is an encoder target, **not a guaranteed measured bitrate
or output-size cap**. Without bitrate, fixed technical settings are libx264 medium,
CRF23, yuv420p. Plans expose those settings. These are reproducible writer defaults,
not platform/quality recommendations. No hardware, HEVC/AV1 or optional encoder paths.

| Video operation | Additional required parameters | Exact behavior |
| --- | --- | --- |
| trim | start and exactly one of duration/end | Nonnegative start, positive continuation interval within header-reported source duration; end normalizes to duration; re-encode, not GOP stream-copy |
| resize | width, height | Exact dimensions, potentially distorting original aspect |
| crop | left, top, width, height | Even integer origin/dimensions within source bounds |
| contain | width, height, background | Scale proportionally to fit explicit canvas and centre-pad; scaled dimensions/offsets round down to even pixels; opaque #RRGGBB only |
| fps | fps | Numeric 1–120; frame duplication/drop with near rounding, no motion interpolation |
| transcode | none | Re-encode to selected bounded container/codecs; optional remove audio/bitrate |

Geometry axes are 2–8192, even, with 16,777,216 output/source pixel cap. Input video
must have exactly one H.264 avc1 video stream, optional one AAC mp4a audio stream,
no extra tracks, known zero rotation, explicitly declared square pixels and uniform
sample timing at 1–120 fps. Unknown pixel aspect, rotation, variable timing,
fragmented MP4/MOV, extended QuickTime entries and unsupported streams reject.
This deliberately matches the existing header-inspection and required-runtime
baseline; it does not infer decoder support for other catalogued codecs.

Audio common required parameters: `container: wav`, `audioCodec: pcm_s16le`.
Output is PCM16 WAV; no MP3/FLAC/AAC audio-only output in this bounded wave.
Optional output `sampleRate` is 8000/16000/22050/24000/32000/44100/48000 Hz;
`channels` is 1 or 2. Defaults explicitly preserve inspected source rate/channels.
Input is one PCM16 WAV or one AAC mp4a MP4/MOV audio stream, no video/other tracks,
mono/stereo at a supported declared rate. Video audio preservation re-encodes AAC,
retaining inspected rate/channels; it does not promise bitstream identity.

| Audio operation | Additional required parameters | Behavior |
| --- | --- | --- |
| trim | start plus duration XOR end | Same interval validation/normalization as video |
| fade_in | seconds | Linear amplitude fade from time 0; duration 0 is an explicit no-op |
| fade_out | seconds | Linear amplitude fade ending at header-reported source duration |
| gain | gainDb | Numeric −60…24 dB, including zero; no clipping avoidance/subjective improvement promise |
| resample | sampleRate | Explicit supported output rate through FFmpeg resampling |
| channels | channels | Explicit mono/stereo conversion through backend channel conversion |
| convert | none | PCM16 WAV conversion plus optional rate/channel export controls |

Time parameters are finite seconds bounded to 86,400, normalized to the backend
microsecond clock (nearest microsecond, exposed in plans; at most 0.5µs rounding);
Positive values rounded to zero reject. Trim duration/end must be
positive and within known source duration; outputs shorter than one output frame/sample
reject before execution. Fades are nonnegative and fit duration; nonzero fades require at least one source
audio sample.
Each request has one operation and its required encoding steps, not an operation
list/DAG. Standard backend resampling/downmixing is deterministic within the recorded
build, not semantic Audio Production. Loudness normalization is **deferred**: loudnorm
is optional, and this wave has no reviewed measured/multi-pass target contract.
Optional codecs, arbitrary layouts, named presets, file-size targeting and full
mixing/Audio Production remain future work. Technical dimensions/fps/codec/container/
bitrate/rate/channel primitives are available for a later Delivery Presets layer.

Example video request:

```js
const request = {
  projectHandle, assetId: 'registered_video', operation: 'trim',
  parameters: { start: 1, end: 3, container: 'mp4', videoCodec: 'h264',
    audio: 'preserve', audioCodec: 'aac' },
};
await window.whihmHost.planMediaFinishing(request);
// Requires separately authorized execution and a fresh baseline-ready runtime:
await window.whihmHost.finishMedia({ ...request, allowExecution: true });
```

### Multimedia planning, execution and verification

Plans read source headers/integrity, normalize parameters, expose expected facts,
writer settings, all required baseline features, last runtime observation and
`execution.executable`/blocking reasons. They never probe, create output, spawn a
transform, authenticate or mutate projects. Unobserved runtime is unverified. Even
a cached ready plan requires a fresh lease before execution; it is not authorization.

Execution requires literal allowExecution=true. The existing runtime resolver
freshly re-probes the same pair and retains private paths/stat identities in an
internal execution lease. Pair identity is rechecked immediately before/after the
transform. No second discovery, caller executable or renderer runtime override.
Trusted installed binaries are not an adversarial-binary sandbox; stat checks do
not eliminate administrator races or prove executable authenticity.

[multimedia-finishing-backend.mjs](multimedia-finishing-backend.mjs) stages verified
source bytes in a private temporary directory. Input demuxer is fixed from inspected
container; file is the only allowed input protocol; MOV external track references
and absolute drefs are explicitly disabled. Arguments are built internally, shell=false,
stdin ignored, no overwrite, metadata/chapter copying disabled globally. The existing
probe's safe process lifecycle is shared via [multimedia-process.mjs](multimedia-process.mjs):
OS-only environment, no provider credentials/FFREPORT/preload hooks, 256KiB combined
diagnostics, 120-second transform wall timer, SIGKILL then close/1-second uncertainty
fallback. Diagnostics/paths are never returned publicly. Decoder/encoder/filter
threads are bounded to 1, single allocation to64MiB, output constrained with -fs
and independently rejected above the existing 64 MiB import bound. These are resource
limits, not a total native-memory sandbox or hard child-tree termination guarantee.

Successful exit is insufficient. Reused Media Inspection must parse a positive-size
output and verify kind/container, stream count/codecs, audio presence, duration and
requested rate/channels; video also verifies exact dimensions, zero rotation,
square pixels and fps. Video duration tolerance is one expected frame plus one
AAC packet (1024/sampleRate if audio exists); audio tolerance is one output sample.
FPS tolerance is 0.0001 fps. Both container and relevant stream durations are checked;
unknown facts fail closed. These header checks do not prove decodability, exact
trimmed samples, pixel fidelity, achieved bitrate or loudness. Media Inspection's
pre-existing container/sample-entry limitations still apply.

Only verified bytes reach the existing importer. Derived asset.source retains
parent ID/checksum; metadata.deterministicFinishing records normalized operation,
observed runtime source/version/build digests, output inspection and verified checks/
tolerances. Registry/result carry output checksum/size. Source bytes remain immutable;
outputs have separate UUIDs/logical paths. Private staging is removed before publication
and publication temp files after import. Process failures/timeouts, changed runtime,
malformed/missing/mismatched outputs never register. Termination uncertainty remains
a failure; temporary removal is attempted, never a claimed successful transform.
Existing importer atomic-publication limitations remain unchanged.

Evidence for command semantics is the reviewed first-party FFmpeg8 documentation:
[CLI options](https://github.com/FFmpeg/FFmpeg/blob/n8.0/doc/ffmpeg.texi),
[typed filter behavior](https://github.com/FFmpeg/FFmpeg/blob/n8.0/doc/filters.texi),
[MOV external-reference controls](https://github.com/FFmpeg/FFmpeg/blob/n8.0/doc/demuxers.texi).
These public documentation GETs are not binary/runtime acceptance. No provider call.

## Image plan, execute and verification

Plans use existing Media Inspection to validate registered integrity and source
facts, then validate geometry/encoding. They expose logical source identity,
inspection, normalized parameters/effective defaults, expected dimensions/container,
Sharp version, zero provider cost/transport and limitations. They create no files,
run no transform worker, mutate no project and obtain no credentials. Unlike an
inspection-only plan, a finishing plan reads source headers because geometry needs
those facts; it does not decode/transform media.

Execute separately requires `allowExecution: true`. It replans/rechecks source
bytes and checksum, then runs exactly one allowlisted operation in a worker. The
worker receives no paths, URLs, commands, filtergraphs or arbitrary Sharp options.
It returns bytes and native-library versions, writes no files and is terminated
after success/failure. A 20-second libvips processing timeout and 30-second worker
wall timer apply. Worker termination requests can wait for native cancellation;
this is not an OS sandbox or guaranteed hard real-time deadline. JS heap bounds
do not bound all native memory. Failed/timed-out work cannot publish output.

Before registration, the same Media Inspection buffer primitive verifies actual
output format, single-page count, exact upright dimensions, normalized orientation
and JPEG's absent alpha channel. Contradiction, empty/malformed output or oversize
output rejects before any project asset is accepted. This verification confirms
technical properties, not aesthetics, exact resampled pixels or exhaustive tags.

Verified bytes are written with exclusive 0600 creation into a private temporary
directory, then passed to existing project.importAsset. Sources are never overwritten.
The importer creates a separate immutable UUID asset/path and computes its checksum;
returned checksum/size must match verified bytes. Distinct identical requests create
separate assets; there is no dedup/cache. Temporary files are removed on success and
failure. Cleanup failure after a successful publication returns the accepted result
with FINISH_TEMP_CLEANUP_REQUIRED; it does not hide a durable asset. Existing project
atomic-publication limitations remain authoritative; no new rollback/transaction
framework is introduced and importer-owned files are never guessed away on error.

Asset.source records the immediate parent assetId/checksum, using existing reference
integrity rules. Asset.metadata.deterministicFinishing records schema/tool/operation,
normalized parameters and actual Sharp/native-library versions. Result schema 1
returns logical output ID/path/MIME/hash/size, output inspection and explicit verified
checks. No machine path, generated provider URL or raw error text is exposed.

Reproducibility is scoped to identical source bytes, normalized parameters and backend
versions. PNG/JPEG/WebP fixtures verify repeatable hashes on this backend; cross-
version/platform bit identity is not promised. Immutable IDs/paths differ per import.

## Discovery and boundaries

The validator owns the operation/writer schema and projection descriptor in
[media-finishing.mjs](media-finishing.mjs); [image-finishing-backend.mjs](image-finishing-backend.mjs)
owns the worker backend. Projection derives one local reviewed/partial tool:
**42 capabilities / 603 entries; 138 available reviewed, 396 available generic**.
All prior 602 entries and 13 remote modes are unchanged. Existing v1 projection and
planning-context APIs automatically expose FINISH_MEDIA/media-finishing without
planning-specific model branches. All three media kinds/operation schemas and separate
image-available versus video/audio-runtime-gated scopes derive from the validator.
Projection/planning stay schema 1 and 42 capabilities/603 entries; all other entries
retain their prior semantics. Binding metadata names both host operations and
separate execution permission. Runtime/fidelity readiness remains unverified beyond
the stated fixtures and local backend tests; no provider execution occurred.

This is the second bounded WHIHM extension after Media Inspection, now implemented for bounded
image/video/audio scopes. Real multimedia acceptance remains unverified on this
machine; later Audio Production/Delivery Presets can reuse the low-level primitives. No workflow/agent execution,
semantic QC, provenance system, ranking or other extension is implemented.

Historical image-milestone QA: **57 new cases** (55 finishing plus two fixed-host cases); **497 unique targeted
tests pass**: 55 finishing, 64 Media Inspection, 44 projection, 43 planning, 65 full host
and 226 bridge/Depth/Suno/high-value-video regressions. Syntax/ESLint pass for all 11
touched JS/MJS files; git diff --check passes. A direct starting-HEAD comparison
confirms the previous 602 projection entries are unchanged. No renderer/Studio
build input changed, so Vite/browser QA was unnecessary. No provider request,
upload, external authentication, dependency download or paid execution occurred.

## Current video/audio-milestone QA

**121 new focused tests; 683 unique targeted tests pass**: 121 multimedia finishing,
55 existing image finishing, 63 multimedia runtime, 64 Media Inspection,44 projection,
43 planning context, 67 full host and 226 bridge/Depth/Suno/high-value-video regressions.
Process fixtures exercise actual Node children for timeout, nonzero exit and bounded
output. Successful multimedia publication tests use explicitly mocked transforms
with generated header fixtures (video headers are not playable encoded video); PCM
WAV fixtures are valid silence. No real video/audio transform acceptance is claimed.
All 11 touched JS/MJS files pass syntax checks and ESLint; git diff --check passes.
No renderer/Studio build input changed, so no Vite/browser QA was needed. No provider
transport, upload, credentials, runtime installation, dependencies or binaries added.

The second WHIHM extension now has bounded image/video/audio contracts and is ready
for source/development integration when its selected backend is available. Media
acceptance with a reviewed installed pair is still required before claiming real
multimedia fidelity. Workflow Execution is a sensible next extension; named Delivery
Presets and full Audio Production can later compose these primitives without
expanding this finishing request into orchestration.
