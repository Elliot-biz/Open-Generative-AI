# Timeline Composition / Media Assembly v1

`COMPOSE_TIMELINE` / `compose_timeline` / `timeline-composition` is a bounded local
renderer, not an editor UI or automatic editing system. Upstream's
`VideoCombiner.jsx` submits a remote `videos_list`/aspect operation. Its contract
cannot express local exact timing, gaps, layers or mixing. It remains unchanged.
This new canonical layer reuses project imports, Media Inspection, multimedia
pair discovery/leases/process safety, Workflow Execution and dynamic projection.
No canonical workflow/project schema change or new dependency is required.

## Machine-authorable document

```json
{
  "schemaVersion": 1,
  "timelineId": "short_production",
  "canvas": {"width": 1280, "height": 720},
  "frameRate": {"numerator": 30000, "denominator": 1001},
  "audio": {"policy": "none"},
  "render": {"container": "mp4", "videoCodec": "h264", "videoBitrate": 4000000},
  "tracks": [{
    "id": "main", "type": "video", "order": 0,
    "items": [{
      "id": "shot", "type": "video",
      "source": {"assetId": "registered_video", "checksum": "64-lowercase-hex-characters"},
      "startFrame": 0, "sourceInFrame": 30, "durationFrames": 60,
      "sourceAudio": "ignore", "transition": "cut"
    }]
  }]
}
```

The checksum placeholder must be replaced with the registered SHA256. Unknown
fields, invalid versions, duplicate item/track IDs, duplicate track orders,
unsupported codecs/transitions and invalid geometry are rejected, never repaired.
Optional top-level `name`/`metadata` are portable annotations. Optional
`durationFrames` may extend, but never truncate, the derived maximum item end.

## Time and layers

All start, source-in and duration fields are **integer frames in the timeline's
rational timebase**, including source trim offsets and audio placement. They are
not original source sample indices. Seconds = frames × denominator/numerator.
Rates normalize by GCD, from 1 through 60 fps. Source video sampling uses FFmpeg
fps duplication/drop, without interpolation or speed changes. Source duration is
checked against header evidence with a 1 microsecond numeric allowance. FFmpeg
trim decimal arguments round to 9 places; public semantics remain rational.

Tracks are video, audio or overlay, ordered by unique integer `order` (0–255),
low to high visual stacking. Array order does not control z-order. Items sort by
start then ID. Video tracks accept video; overlays accept PNG images or video;
audio tracks accept PCM16 WAV. Video inputs are single-stream H.264 MP4/MOV,
unrotated; embedded audio, when selected, must be one AAC stream. PNG must be
single-page with normalized orientation. No arbitrary path or URL is accepted.

Items require source, ID, type, startFrame and durationFrames. Source-in defaults
to zero. Visual `placement: {x,y,width,height}` defaults to the entire canvas:
explicit exact stretching, no automatic crop/contain or semantic reframing.
Coordinates must lie within canvas; widths/heights are positive even pixels.
PNG alpha is retained during composition. Video is normalized to square pixels.

Adjacent items cut at their exact frame boundary. Same-track visual overlaps
reject, including on disabled tracks. Separate visual tracks overlap by z-order.
Audio overlaps sum. Gaps and space outside visual placement are opaque black;
audio gaps are silence. Overlays/audio may extend total duration. Disabled tracks
are validated and contribute to derived duration, but do not render. Explicit
longer duration produces trailing black/silence. Limits: 8 tracks, 32 items,
600 seconds, axes ≤4096, canvas ≤8,294,400 pixels; aggregate source bytes and
output each ≤64 MiB. No looped video, freeze-frame extension or hidden retiming.

## Audio policy

Every video item explicitly declares `sourceAudio: "ignore" | "use"`. There is
no implicit soundtrack preservation. `audio.policy: "none"` rejects audio items
and `use`. `mix` requires sampleRate (44100/48000), channels (1/2), and AAC bitrate
(32000–320000). It augments selected video audio with separate audio tracks.
Mix may contain only silence. Per audible item gainDb defaults to 0, bounded
−60 through +12. No automatic loudness normalization, limiter or ducking;
overload/clipping is the author's responsibility. Audio trim/start boundaries
round independently to nearest output sample from rational frame time. This
bounds quantization to half a sample; it does not accumulate millisecond drift.
Existing restore_source_audio remains unchanged for independent finishing jobs.

## Plan, render and verification

`timeline-contract.mjs` normalizes/validates portable JSON; `timeline-composition.mjs`
resolves registered sources with existing integrity checks and Media Inspection.
`planTimelineComposition({projectHandle,timeline})` reads technical facts and the
last runtime observation, creates no files, runs no process or provider and does
not refresh discovery. It returns normalized timeline/layers, sources, hashes,
required features, expected output and executable/blocking detail.

`composeTimeline({...request,allowExecution:true})` rechecks sources, acquires a
fresh `WHIHM_MEDIA_FINISHING_BASELINE_V1` lease and requires the operation's extra
advertised features. The baseline's required set is unchanged; narrow optional
probe names were added for color, setsar, settb, anullsrc, adelay and amix.
Overlay/format and PNG/image2 readiness also gate relevant requests.

`timeline-backend.mjs` compiles only normalized typed values to private arguments:
trim, timestamp reset, fps, scale, placement, source silence and audio mix.
It uses the existing shell:false process runner, sanitized environment, one
thread, file-only inputs, disabled movie external references, 120-second timeout,
bounded diagnostics and output-size limit. Only controlled temp paths enter argv.
No raw command/filtergraph/executable/output path is accepted by the host.
Default writer preset is medium, yuv420p, software libx264; bitrate is caller
supplied. Reproducibility is scoped to identical inputs/settings/library versions;
no cross-platform byte-identity promise.

Exit zero is insufficient: Media Inspection verifies MP4/avc1, exact dimensions,
frame count, frame-rate tolerance 0.000001 fps, video duration within 1 microsecond,
selected audio presence, mp4a/sample rate/channel count and audio duration within
one AAC packet (1024 samples) plus 1 microsecond. This is header-based technical
verification, not proof of full decoding or subjective quality. Original sources
are rechecked again before publication. Only verified bytes enter immutable
project.importAsset; SHA256 is independently compared. Temporary files are cleaned
on success, process failure, timeout or verification failure. Ambiguous importer
failure is not retried; any committed orphan requires explicit reconciliation.

Output metadata records canonical timeline, definition/render-plan hashes, exact
source checksums, backend identity/versions and timestamp. No global provenance
system or cache was added. Hashes use existing stable JSON/SHA256. Top-level labels
and metadata do not affect render hash; timing, sources, placement, output and
audio settings do. Asset IDs stay in hash/evidence even for identical bytes.

## Workflow and discovery

Existing utility executor `{type:"utility",id:"whihm",tool:"timeline-composition"}`
uses inputs `timeline` (json) and `sources` (asset, cardinality many), output video.
Every referenced source must appear in typed sources bindings; nested timeline
sources use ordinary assetId/checksum records, not opaque paths or `$asset` objects.
This keeps source/dependency tracking in the existing engine. Sources may bind
upstream assets; author the corresponding timeline checksum before dispatch.
Execution is authorized through existing runWorkflow and readiness revalidation.
Changing source bindings or timeline timing invalidates the whole render node and
actual descendants, preserving unrelated branches; no automatic rerender/fallback.
Approvals, session-only continuation and workflow schema remain unchanged.

Projection adds one local capability/entry (49 groups /617 entries). Generic
planning derives discovery without a separate registry. The two host/preload APIs
are planTimelineComposition and composeTimeline. No UI/editor/build inputs change.

## Verification status and deferred scope

Current shell reports MM_PAIR_ABSENT. Fixture tests validate contracts, command
construction, output-verification/import boundaries, cleanup, host and workflows.
They do not certify actual FFmpeg rendering. The committed opt-in-by-availability
real acceptance test creates tiny video/PNG/WAV fixtures and verifies sequential
assembly, overlay, mixing and final inspection when an approved pair is present;
it skips cleanly otherwise. No runtime is installed by this task.

Captions/subtitles, dissolve/crossfades, advanced transforms, DSP, timeline UI,
beat intelligence, selective render cache, automatic editing and Agent Execution
are deferred. Cut-only v1 is intentional. No providers or paid execution are used.
FFmpeg semantics follow the [official filters reference](https://ffmpeg.org/ffmpeg-filters.html).

Targeted QA: 44 new cases (43 pass, 1 real-runtime skip). Across new timeline,
workflow execution/core, project integrity, multimedia runtime/finishing,
inspection, projection/planning, host/preload, benchmark, guidance and segmentation
regressions: 1,025 unique tests passed and one skipped. Syntax/ESLint pass for all
19 touched JS/MJS files. No renderer build or browser QA was required.
