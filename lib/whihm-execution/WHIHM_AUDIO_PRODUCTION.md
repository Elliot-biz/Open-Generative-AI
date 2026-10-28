# Audio Production Foundation v1

`PRODUCE_AUDIO_MIX` / `produce_audio_mix` / `audio-production` adds a bounded
local track → bus → master layer. Existing upstream reviewed Suno music/sounds,
MiniMax/ElevenLabs speech and Gemini dialogue routes remain generation sources.
Upstream audio nodes do not provide a local bus/DSP/automation contract. The new
layer reuses project assets, Media Inspection, the Timeline rate/sample helpers,
its trusted staging backend, paired runtime leases and bounded process runner.
No second runtime, clock, provider client, workflow schema or UI is introduced.

## Definition and timing

The executable contract is `audio-production-contract.mjs`. Example:

```json
{
  "schemaVersion": 1,
  "definitionId": "production_mix",
  "timelineId": "optional_existing_timeline",
  "frameRate": {"numerator": 25, "denominator": 1},
  "durationFrames": 50,
  "master": {"sampleRate": 48000, "channels": 2,
    "processors": [{"type": "limiter", "limit": 0.8}]},
  "buses": [{"id": "music"}, {"id": "dialogue"}],
  "tracks": [{"id": "score", "category": "music", "busId": "music",
    "events": [{"id": "cue", "source": {"assetId": "registered_source", "checksum": "REPLACE_WITH_SHA256"},
      "startFrame": 0, "sourceInFrame": 0, "durationFrames": 50,
      "gainDb": -6, "pan": 0, "fadeInFrames": 5, "fadeOutFrames": 5}]}]
}
```

All canonical times are integer frames using the existing normalized rational
Timeline rate (1–60 fps). At execution, boundaries round independently to nearest
sample via Timeline's shared `timelineSample`; no accumulated millisecond clock.
Audio cannot exceed the declared frame duration. Output length is the rounded
frame-duration sample count. Limits: 600 seconds, 16 tracks, 8 buses, 64 events,
32 automation points/envelope, 8 processors/stage, 64 MiB aggregate inputs/output.
Stereo PCM16 WAV masters at 44.1/48 kHz; definitions exceeding output size reject.
Unknown fields, duplicate IDs, unsupported routing and malformed values reject.

## Tracks, buses, stems and sources

Categories: dialogue, music, sfx, ambience, generic. Categories express intent,
not provider identity. Tracks have enabled/mute (default true/false), busId,
gainDb/pan, automation/processors and overlapping events. Bus IDs are generic;
all buses route to master. No arbitrary cycles or plugin routing graph.

Sources require registered assetId and matching SHA256: PCM16 WAV or a single
AAC stream in MP4/MOV (including source-video soundtrack). Mono/stereo accepted.
Original provider metadata stays in the asset registry; generated music/speech/SFX
enter identically to imported media after registration. Remote URLs, opaque Suno
voice IDs and provider continuation tokens are not assets. Unsupported encodings
must first be converted by a supported upstream path. No automatic remote fetch.
Events may label `stem`; existing stems are independent normal assets. No source
separation or semantic classification is performed.

## Levels, automation and DSP

Each event/track/bus/master supports gainDb (−60 to +12), pan (−1 to +1),
automation and ordered processors. Default gain/pan is 0. Stereo pan uses linear
balance: left multiplier min(1,1-pan), right min(1,1+pan). Mono is converted to
stereo first. It is not an equal-power spatial panner.

Automation is `{gainDb|pan: {interpolation: "linear"|"hold", points:
[{frame,value},...]}}`. It replaces the corresponding static value; values before
first/after last hold endpoints. Event frames are event-local; track/bus/master
frames are mix-global. Expressions evaluate per sample, using rational frame time.
Fades are linear amplitude, independently specified in integer frames; their sum
cannot exceed event duration. Crossfades are explicit overlapping events with
complementary fade-out/fade-in, not an inferred edit. SFX may overlap freely.

Processors and exact required controls:

- highpass/lowpass: frequency 20–20000 Hz.
- equalizer: frequency 20–20000 Hz, q 0.1–10, gainDb −24 to +24.
- compressor: thresholdDb −60 to 0, ratio 1–20, attackFrames/releaseFrames,
  makeupDb 0–24. FFmpeg acompressor downward defaults otherwise apply.
- gate: thresholdDb, ratio, attackFrames/releaseFrames; FFmpeg agate downward.
- limiter: limit 0.0625–1 linear sample peak. FFmpeg alimiter with level=0 and
  latency compensation enabled. No automatic makeup, true-peak or perceptual
  mastering guarantee; PCM quantization can differ by one least-significant bit.

Attack/release must be positive integer frames and fit the backend ranges:
attack ≤2000 ms, release ≤9000 ms. No silent clamping. Processor order is explicit;
put a limiter last on master if final sample-peak control is required. With no
limiter, summing may clip; there is no subjective/default mastering policy.

A bus may declare `duck: {triggerBus, thresholdDb, ratio, attackFrames,
releaseFrames}`. V1 allows one distinct trigger/target pair. Trigger is the
processed trigger bus; target is processed target bus; sidechaincompress applies
before master sum. Trigger remains audible. Both stay on the same fixed-length
sample grid. Attenuation follows actual signal envelope/ratio, not a guaranteed
fixed reduction or speech classification. Recovery follows release, no semantic
voice detection. No fallback or automatic retry.

## Plans, rendering and assets

`planAudioProduction({projectHandle,definition})` validates sources/integrity and
returns normalized definition, sources, mixHash/renderPlanHash, required filters,
last runtime snapshot and blockers. No process/network/output creation.
`produceAudioMix({...request,allowExecution:true})` uses a fresh baseline-ready
paired runtime and per-operation features. Additional filter names are optional
probe metadata; existing baseline required set and Timeline behavior stay intact.

Typed compiler builds internal FFmpeg arguments only. The shared Timeline backend
stages private files, disables remote/external movie references, enforces shell:false,
process timeout/output bounds, runtime identity checks, and cleanup. Master bytes
are inspected for PCM16 WAV, sample rate/channels and duration within one sample;
only then immutable import runs. Sources are rechecked before publication. Output
records checksum, source hashes, exact definition, mix/render hashes and backend
versions. Hash excludes definition/timeline labels, sections, analysisRefs and
annotation metadata; all processing/routing/event state affects the mix hash.
No cache/deduplication or cross-version/platform byte identity guarantee.

Workflow utility `audio-production` accepts definition (json) and sources (asset,
many); output is audio. Sources must bind exactly all event assets, preserving
existing source/dependency hashing. Changed controls or sources stale the mix node
and descendants through existing invalidation; unrelated branches remain valid.
Existing approval/session/provider-liveness boundaries are unchanged.

## Video, markers and discovery

A duration-matched master can be attached using existing finishing
`restore_source_audio`, selecting the master as sourceAudioAssetId. That operation
copies H.264 video and encodes donor audio as AAC. Or place the WAV as a Timeline
audio item with explicit embedded-source audio ignored. No parallel compositor.

Optional sections: `{label,startFrame,endFrame,evidence: manual|provider|candidate}`.
Custom names are supported. These are annotations, not inferred musical truth.
Optional analysisRefs are registered assetId/checksum evidence references;
referenced bytes are verified. They do not authorize execution or change mix sound.
Benchmark can reference ordinary master/video assets without ranking or cost inference.

Projection derives one added capability/entry dynamically (50 groups /618 entries).
Host/preload expose only planAudioProduction and produceAudioMix. Runtime status
is an observation; a bound capability never bypasses fresh execution readiness.

## Current partial scope

Automatic transient/onset, tempo/beat/downbeat and music-section inference are
**deferred**, not reported as detected evidence. No ANALYZE_AUDIO_TIMING capability
is advertised. Pitch/time changes were reviewed against FFmpeg atempo/asetrate,
but are deferred: source-duration/latency/pitch-quality verification needs its own
bounded acceptance before exposing these as production controls. There is no
implicit semitone, tempo, sample-rate or FPS policy. No heavy ML is required.

Real local acceptance uses the existing staged 7.0.2 runtime/helper, generated
sine/WAV/video fixtures, bus ducking/DSP/master rendering and existing final mux.
Fixture tests cover contracts, plan/registration/workflow boundaries. No provider
calls, paid generation, user-media uploads, dependency installs or renderer work.
DSP semantics follow the [FFmpeg filters reference](https://ffmpeg.org/ffmpeg-filters.html).

Acceptance at implementation: 29 new tests pass, including two real-runtime
renders/measurements and video packet-hash equality across the existing mux.
808 unique targeted tests pass across affected suites, project integrity and
projection-count regressions. Syntax/ESLint pass for 20 touched JS/MJS files.
The broader feature request remains PARTIAL because timing analysis and controlled
pitch/time processing are explicitly deferred rather than advertised as implemented.
