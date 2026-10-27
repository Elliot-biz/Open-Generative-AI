# Deterministic Finishing Foundation v1

**Safe PARTIAL: complete bounded image subset.** Capability `FINISH_MEDIA`, local
mode `finish_media`, tool `media-finishing`. No generative provider, editor UI,
semantic decisions, finishing workflow, batch scheduler or named delivery preset.

## Tooling gate

The checkout/environment has no app-supported FFmpeg/ffprobe binary, discovery,
version policy or packaging contract. Wan2GP's internal Python children are not
an application-wide media-transform backend. Adding a hard binary dependency
would require source/dev and Windows/Electron deployment decisions outside this
milestone. **All video/audio transforms remain deferred**, including trim, fades,
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

Single-page PNG/JPEG/WebP/GIF/TIFF inputs; PNG/JPEG/WebP output. Animated/multi-page
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
controls exist. Low-level image dimensions/format/compression are reusable by a
later Delivery Presets layer; no preset library is added here.

## Plan, execute and verification

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
owns the worker backend. Projection derives one new local reviewed/partial tool:
**42 capabilities / 603 entries; 138 available reviewed, 396 available generic**.
All prior 602 entries and 13 remote modes are unchanged. Existing v1 projection and
planning-context APIs automatically expose FINISH_MEDIA/media-finishing without
planning-specific model branches. Binding metadata names both host operations and
separate execution permission. Runtime/fidelity readiness remains unverified beyond
the stated fixtures and local backend tests; no provider execution occurred.

This is the second bounded WHIHM extension after Media Inspection, complete for its
image scope. Audio Production primitives and video/audio Delivery Presets need a
separately reviewed transform-runtime foundation. No workflow/agent execution,
semantic QC, provenance system, ranking or other extension is implemented.

QA: **57 new cases** (55 finishing plus two fixed-host cases); **497 unique targeted
tests pass**: 55 finishing, 64 Media Inspection, 44 projection, 43 planning, 65 full host
and 226 bridge/Depth/Suno/high-value-video regressions. Syntax/ESLint pass for all 11
touched JS/MJS files; git diff --check passes. A direct starting-HEAD comparison
confirms the previous 602 projection entries are unchanged. No renderer/Studio
build input changed, so Vite/browser QA was unnecessary. No provider request,
upload, external authentication, dependency download or paid execution occurred.
