# Media Inspection + deterministic technical validation v1

`INSPECT_MEDIA` is the first true WHIHM extension: a local, read-only technical
utility, not a generative executor or semantic media analyzer. Its tool ID is
`media-inspection`, mode `inspect_media`, and normalized result schema version is 1.
The existing 13 remote modes and 601 projection entries are unchanged. Inspection
adds one local reviewed tool: **41 capabilities / 602 executor entries**, including
137 available reviewed, 396 available generic, 22 deferred, 34 provider-blocked and
13 local-constrained. All 602 retain runtime-unverified projection flags: fixtures
verify supported headers, not arbitrary files, deployments or provider fidelity.

## Host operations and safety

```js
const request = { projectHandle, assetId: 'registered_video' };
await window.whihmHost.planMediaInspection(request);
await window.whihmHost.inspectMedia({
  ...request,
  allowExecution: true,
  requirements: { minWidth: 1280, minHeight: 720, expectedAudio: true },
});
```

These fixed trusted-host operations use the existing project handle, asset registry,
boundary/symlink checks and checksum/size integrity verification. Only registered
image/video/audio MIME classes are accepted. Extra request fields, direct URLs,
filesystem paths and caller-selected backends are refused. Bytes are read through
the existing project I/O helper and rechecked against registry identity before
inspection. No absolute path, EXIF text, arbitrary tags or binary payload is returned.
The existing 64 MiB asset limit applies. One host inspection/plan runs at a time.

Inspection requires its own explicit `allowExecution: true`, consistent with the
existing utility execution boundary. This is local execution permission, not provider
authorization or liveness. No credentials, renderer execution, subprocess, remote
transport, upload, project write, history mutation or generated asset is involved.

Plans validate the profile and registered project identity/integrity using normal
project reads. They do **not** run media-header inspection, Sharp, decoding or tools.
They retain logical asset path/checksum, declared media kind, backend candidates,
profile, expected fields and explicit zero provider cost/remote transport. Backend
selection by content signature happens at inspection. A plan is not proof of a
readable/compatible file. Inspection and validation success remain distinct.

## Backends and bounded format coverage

No dependency, package manifest, binary download, FFmpeg requirement or packaging
change is introduced. ffprobe/FFmpeg were absent from this checkout/environment.

| Input | Backend | Deterministic facts |
| --- | --- | --- |
| PNG/JPEG/WebP/GIF/TIFF | Existing Next/Sharp dependency, metadata only | Format, encoded dimensions, EXIF-adjusted dimensions, aspect, landscape/portrait/square orientation, alpha-channel presence, reported color space/channels and page count |
| RIFF/WAVE PCM or IEEE float | Bounded Node Buffer chunk reader | Duration from data byte count/format byte rate, codec tag, sample rate, channels, bits per sample, uncompressed bitrate |
| Non-fragmented ISO-BMFF MP4/MOV with supported ftyp brands | Bounded Node Buffer box reader | Movie/track duration, every track in file order, codec sample-entry FourCC, video dimensions, explicit pixel/display aspect, quarter-turn rotation, rational average frame rate/sample timing, audio sample-entry sample rate/channels, audio presence, stream counts, estimated file bitrate |

Readers reject out-of-bounds/truncated structures and impose chunk/box/track/table
limits. They skip unrelated metadata, never follow media references and never
decode or modify samples. MP4/MOV duration is header-reported; edit lists and actual
sample playback are not evaluated. Rational frame rate is an average from stts, not
a constant-rate promise. Container bitrate is explicitly estimated from registered
file size and reported movie duration; MP4 stream bitrate/channel layout stay unknown.
Video `displayDimensions` are rotation-adjusted coded pixels; `displayAspectRatio`
also requires explicit pixel-aspect metadata. Arbitrary rotation/scaling matrices
are not interpreted. Audio sample-entry facts do not certify codec configuration.

Unsupported in v1: MP3/AAC elementary/FLAC/Ogg/WebM and other unlisted containers,
fragmented MP4, old MOV without ftyp, multiple sample descriptions per track,
extended QuickTime audio entries, compressed/extensible WAV, SVG/HEIF/AVIF.
Animated-image timing, actual transparent-pixel detection, calibrated color,
decodability and frame-perfect duration are not certified. Alpha means an alpha
channel exists, not that any particular pixel is transparent. If existing Sharp
is unavailable for an image, the operation fails with `MEDIA_BACKEND_UNAVAILABLE`.

## Result and validation contract

Results contain `schemaVersion`, `status`, capability/tool/mode, logical `source`,
`facts`, `unavailable`, `validation`, `inspection`, limitations and diagnostics.
Source references existing asset ID/path/checksum/declared MIME and safe extension.
Facts include media kind, detected container, file size, duration, bitrate with
basis/estimate flag, image facts, all streams, stream counts and audio presence.
`inspection` identifies the actual backend/version and `evidence: headers_only` /
`decoded: false`. Known values are concrete; unknown or inapplicable scalar fields
are null, with field paths classified in `unavailable` as `not_reported` or
`not_applicable`. No missing dimensions, codec, stream, duration or media URL is made up.

Optional `requirements` accepts only:

- `expectedMediaKind`: image/video/audio.
- `minDuration`, `maxDuration`: nonnegative seconds.
- `minWidth`, `minHeight`: positive integer rotation-adjusted pixel dimensions.
- `aspectRatios`: nonempty positive numerical ratios; optional nonnegative
  `aspectTolerance`, otherwise exact numerical equality. For video, comparison
  requires known display aspect; no square-pixel fallback is invented.
- `minFrameRate`, `maxFrameRate`: positive average frames per second.
- `allowedCodecs`: exact returned codec IDs, e.g. pcm/ieee_float/avc1/mp4a.
- `allowedContainers`: exact supported container names.
- `expectedAudio`: boolean; `maxFileSize`: nonnegative integer bytes.

Malformed, unknown, nonfinite or inverted requirements reject. Every relevant video/
audio stream is checked; no primary stream is silently selected. `validation.status`
is `not_requested`, `pass`, `fail` or `unknown`. Unavailable facts produce
`REQUIREMENT_UNEVALUABLE`, never a compatibility pass. Comparison warnings include
media-kind/aspect/audio-presence mismatch, dimensions below minimum, duration or
frame rate outside requirements, codec/container not allowed and file size exceeded.
Intrinsic `technicalWarnings` only report nonpositive duration/dimensions when known.
No universal resolution, frame-rate, bitrate or aesthetic threshold exists.

Structured failures preserve project asset/integrity codes and inspection codes:
`MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TYPE_MISMATCH`, `MEDIA_FORMAT_UNSUPPORTED`,
`MEDIA_UNREADABLE`, `MEDIA_BACKEND_UNAVAILABLE`, `MEDIA_BACKEND_OUTPUT_INVALID` and
`MEDIA_PROFILE_INVALID`. Failures contain no fabricated facts or raw parser errors.

## Projection, planning and verification

[media-inspection.mjs](media-inspection.mjs) owns the profile validator and tool
descriptor; [media-header-probe.mjs](media-header-probe.mjs) owns bounded header reads.
The projection consumes that descriptor; existing planning-context code is unchanged.
Overview, `getCapabilityContext('INSPECT_MEDIA')` and
`getExecutorContext('media-inspection')` derive it automatically. Both projection
and planning-context remain schema v1. Local route/backend constraints, registered
media roles and partial format coverage are explicit; no model registry is copied.

Fixtures include real tiny raster images and PCM WAV plus generated ISO-BMFF header
fixtures. Video tests prove header extraction and bounds, not encoded-video playback.
No provider execution or browser/UI testing is involved. Existing packaged-source
omission remains a separate high-severity shipping blocker. Source/development use
is available with the stated formats and installed existing Sharp dependency.

This milestone adds no semantic tagging, OCR, transcription, creative QC, scoring,
scene understanding, finishing, workflow/agent execution or other extension scope.

QA: **66 new cases** (64 inspection/validation/projection cases plus two fixed-host
cases); **440 unique targeted tests pass**: 64 inspection, 44 projection, 43 planning,
63 full host and 226 existing bridge/Depth/Suno/high-value-video cases. The two host
inspection cases were rerun after final scoped guards. Syntax checks and ESLint
pass for all 11 touched JS/MJS files; `git diff --check` passes. A direct comparison
against the starting projection confirms that all prior 601 entries are unchanged.
No shared renderer/Studio build inputs changed, so no Vite or browser QA was needed.
