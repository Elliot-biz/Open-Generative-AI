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

## Timing analysis and manipulation extension

`ANALYZE_AUDIO_TIMING` / `audio-timing-analysis` / `analyze_audio_timing` is a
local PCM16 WAV evidence utility. Existing upstream pitch fields belong to remote
speech generation; no reusable local onset/tempo analyzer was found. No provider
client or audio runtime was added. PCM samples are read only after existing Media
Inspection and checksum validation; mono/stereo inputs share the 64 MiB asset cap.

Host request: `{projectHandle,assetId,checksum,frameRate,settings?,allowExecution:true}`.
The mandatory frameRate uses the normalized Timeline rational clock. Settings
allow only riseThreshold (0.01–1, default 0.15). No path/filter/model input.
Workflow utility accepts assetId as an asset port, checksum/frameRate/settings as
parameters, and a json result containing the registered analysis artifact reference.
Planning validates inputs without calculating candidates, creating files or probing.

Versioned pcm-peak-rise-v1 uses approximately 10 ms sample windows and normalized
absolute channel peak rises, with 100 ms candidate refractory spacing. Each onset
records original sample, nearest Timeline frame, rise strength and window start.
Strength is an amplitude difference, not calibrated confidence or an impact label.
Frame mapping is round(sample × fpsNumerator / (sampleRate × fpsDenominator));
rounding error is at most half a Timeline frame, with window-level localization.

At least four onsets and ≥70% agreement around the median inter-onset interval
(within max(20 ms,5%)) admit tempo hypotheses. Half/base/double interval tempos
within 30–300 BPM are retained explicitly; intervalAgreement is evidence rather
than musical certainty. Beat candidates are observed onsets under this regularity
hypothesis, never interpolated/predicted beats. Soft, sustained, syncopated, noisy
or complex audio can yield missing/spurious candidates or no stable tempo.
Downbeats/meter phase are explicitly unsupported. No semantic section inference,
cut/SFX selection, automatic action, or human approval is produced.

Analysis schemaVersion 1 includes source identity/hash, rate/channels, timebase,
settings/version, candidate evidence, downbeat limitation, analysisHash/resultHash.
Analysis hash uses source checksum + algorithm/settings + timebase; result hash
covers canonical result evidence. Repeated analyses import separate immutable JSON
artifacts through the existing importer. Their ordinary asset references can be
attached to Audio Production analysisRefs. Unused analysis evidence does not alter
the mix hash or authorize execution.

Audio schema v1 event manipulation is additive:

- `{mode:"pitch",sourceDurationFrames:50,pitchSemitones:3}` preserves event duration;
  sourceDurationFrames must equal event durationFrames. Range −12…+12 semitones.
- `{mode:"stretch",sourceDurationFrames:25}` fits the trimmed source interval into
  event durationFrames while preserving nominal pitch using FFmpeg atempo.
- `{mode:"playback",sourceDurationFrames:25}` changes duration and pitch together
  through sample-rate reinterpretation/resampling.

Source/target duration ratio is bounded 0.5…2. No manipulation object means the
original unmodified behavior. Trims refer to the source interval, target placement
and fades/automation refer to output event frames. Processing order is source
resample/trim → timestamp reset → manipulation → endpoint fit → event gain/pan/DSP
→ fades → placement → track → bus/ducking → master.

Pitch uses asetrate rounded to nearest integer sample rate, aresample back to the
master rate, then inverse atempo compensation. Stretch uses atempo directly.
Integer output samples derive from shared Timeline conversion. Endpoint fit pads
any backend tail shortage with silence or trims excess to the target sample count;
it does not promise transient-phase identity or high-quality extremes. Master
inspection verifies duration within one sample. No additional DSP framework or
hidden semitone/FPS policy. The atempo/asetrate probe names are optional runtime
features gated per mix; baseline required features remain unchanged.

Manipulation parameters participate in mix/render hashes and existing workflow
invalidation. Source duration checks use the explicit sourceDurationFrames. Generic
projection/planning now derives 51 groups /619 entries, including the analysis
capability and manipulation modes/ranges. The only new IPC method is
analyzeAudioTiming; planAudioProduction/produceAudioMix remain the mix API.

Real local acceptance uses the existing staged 7.0.2-static pair and tiny generated
tones/click tracks. No dependencies, providers, paid execution, downloads, UI,
heavy ML, stem separation or new clock/runtime were introduced. FFmpeg behavior
follows the [official filters reference](https://ffmpeg.org/ffmpeg-filters.html).

Completion QA: 13 new cases pass; 821 unique targeted tests pass including affected
regressions. Synthetic 60/90/120/137 BPM, silence/ambiguity, actual ±12/+3 semitone
frequency checks, stretch/playback duration, analysis artifact/workflow registration
and pitch-driven descendant invalidation are covered. Syntax/ESLint pass for all
19 touched JS/MJS files. Real tests source the existing local runtime helper; no
installation, provider calls, paid usage, renderer build or browser QA occurs.
