# Anime / Action Edit Production Benchmark v1

This is a local, free acceptance of an **authored** action-edit plan. It measures
whether the existing production engine faithfully executes defined decisions.
Synthetic colors, flashes, tones, clicks and seeded noise provide measurable
signals; they do not claim artistic quality, autonomous planning or anime realism.

## Run and artifacts

```bash
source node_modules/.cache/whihm-local-runtimes/env.sh
node scripts/run-anime-action-benchmark.mjs
```

Uses the existing approved multimedia pair (acceptance: 7.0.2-static). Missing
runtime or required features fail; no installation/download or provider fallback.
The development CLI prints JSON and retains its generated project and evidence
under a fresh `/tmp/anime-action-*` directory (OS temporary directory on other
platforms). No media enters Git. The test command cleans its generated project:

```bash
source node_modules/.cache/whihm-local-runtimes/env.sh
node --test tests/animeActionBenchmark.test.mjs
```

Canonical scenario is `tests/benchmarks/anime-action-definition.mjs`, benchmark
`anime_action_edit_v1`, version/schema 1, 25 fps, 300 frames (12 seconds), 64×64.
Its decisions, candidate references, required metrics and tolerances are data.
The runner is a development acceptance driver, not a production host API, second
scheduler or second benchmark system. No core production behavior is changed.

## Authored sequence

- Red: frames [0,50); green: [50,150); blue: [150,250); red: [250,300).
- Music: deterministic 120 BPM clicks with a quiet 440 Hz carrier. Explicitly
  select observed beat indices 4,12,20 → frames 50,150,250. No best-beat choice.
- White full-frame flashes at impact frames 75 and 225, one frame each.
- Each impact layers an 80 Hz decaying thump, seeded noise crack and 1000 Hz detail.
  Each is six frames long; the detail explicitly shifts −4 semitones.
- Dialogue proxy: 2000 Hz tone at [100,150). Dialogue bus triggers music ducking:
  threshold −30 dB, ratio 12, attack one frame, release three frames.
- Riser proxy: 700 Hz source, 25 source frames stretched to [175,225), 50 frames.
- Master: explicit sample-peak limiter at 0.85; stereo PCM16 at 48 kHz.
- Final: existing restore_source_audio copies H.264 video and encodes master to AAC.

All fixtures are generated twice; hashes must match. Video uses fixed software
libx264, one thread, bitexact metadata settings. WAV values/seeded noise and PNG
are deterministic in the recorded runtime/library environment. Source checksums,
not assumptions about generator determinism across versions, identify evidence.

## Execution and benchmark reuse

Existing Workflow Execution dispatches registered assets through:

analysis → Timeline Composition / Audio Production → final mux → Media Inspection.

Inputs/outputs use canonical typed ports and checksums. Analysis is an actual
independent node and explicit prerequisite. The author has already selected the
candidate indices; matching observed candidates is a required acceptance metric.
No analysis result creates a creative instruction or grants execution permission.

Existing Performance Benchmark creates a case with fixture identities and records
one observed local attempt. Objective result data is stored in the attempt's
technical evidence. No human ACCEPT/REJECT or numeric review score is fabricated;
optional later human review remains supported by the existing framework. Cost
is not reported, rather than a fabricated provider-billed zero. There is no ranking.

The snapshot and structured result are separately imported as immutable JSON
assets. Final video, silent picture assembly, WAV master and analysis artifacts
are also registered. Result includes benchmark/version, PASS/FAIL, all required
metrics, tolerances, fixture refs/checksums, definition/Timeline/analysis/mix/render
hashes, final output ref/checksum, workflow run ID/hash and runtime identity.
This evaluation data cannot restore a trusted workflow run or continuation.

## Required objective metrics

- Fixture reproducibility: regenerate identical bytes in this environment.
- Beat mapping: expected candidate indices/frame positions and 120 BPM hypothesis.
- Cuts/visual impacts: decode all 300 final MP4 frames into 1×1 PPM color samples;
  require the authored color at every frame, including white impact flashes.
  Cut tolerance zero frames. Synthetic solid colors make this an objective check.
- Layer alignment: isolate each of three SFX layers using the existing mixer;
  first sample above 0.01 amplitude must be within [0,one frame] of both targets.
- Full-master impacts: each impact frame must contain a sample above 0.5.
- Final encoded sync: decode final AAC and measure strongest local peak within
  ±one frame of each visual impact; require amplitude above 0.5. This bounds
  encoded A/V alignment, not perceptual sync or every possible AAC artifact.
- Pitched detail: measured positive-crossing frequency in an isolated 100 ms
  window must be within 15 Hz of 1000×2^(−4/12); removing pitch must change mix hash.
- Ducking: isolate 440 Hz music evidence in fixed 100 ms windows, frame starts
  53 (before), 118 (during), 166 (recovery). During/before <0.5, recovery/before
  >0.85. Require audible 2000 Hz dialogue proxy during the dialogue window.
  These fixed windows establish attenuation/recovery after configured attack and
  release; they do not certify the compressor's full sample-by-sample envelope.
- Stretch endpoint: isolate the riser; first/last samples above 0.001 must lie
  within one frame of the target boundaries. Total master length is exactly
  576000 samples. Audible endpoint and silence-padded nominal fit are distinct.
- Master peak: PCM sample peak ≤0.8501 (includes PCM quantization allowance).
  No true-peak, perceptual mastering, or post-AAC peak ceiling is claimed.
- Technical validity: inspected MP4, avc1/H.264, 64×64, 25 fps, 300 frames,
  mp4a/AAC stereo 48 kHz. Full decode additionally runs for color/audio checks.
- Duration: video matches 12 seconds within 1 microsecond. A/V terminal header
  durations differ by at most 22 ms (one AAC packet plus rounding allowance).
- Reproducibility: same sources/definition produce the same canonical benchmark,
  Timeline, analysis, mix and render-plan hashes. Repeated plan calls must match.
  No cross-version encoded MP4 byte-identity guarantee is introduced.
- Invalidation: shift first impact and all its layers by two frames. Benchmark,
  Timeline/mix/render hashes must change. Mix, picture, mux and inspection become
  stale; independent completed analysis remains valid. No automatic rerender.
- Source integrity: existing project verifier validates registered files/checksums.

Missing or failed required metrics cannot become PASS. Execution/registration
errors throw and the CLI returns structured FAIL with a failing exit code. An
executed attempt may be completed while its technical benchmark result is FAIL;
this is separate from subjective human acceptance.

## Boundaries

This proves controlled execution, not autonomous creative quality, paid model
quality, general music understanding or edit-point selection. Colors are proxies,
dialogue is a tone, and impacts use synthetic audio. Real-world complex codecs,
variable frame rates, dialogue intelligibility, downbeats and musical aesthetics
are outside this benchmark. No new capabilities, host/preload/UI, dependencies,
providers, execution engine, clock or persistent workflow state are introduced.

Implementation acceptance: all 17 required metrics pass using the approved
7.0.2-static runtime. Dedicated tests pass 2/2, affected regression tests 489/489
(491 unique tests total). Syntax/ESLint pass for the four new JS/MJS files;
git diff --check passes. No renderer build/browser QA is needed. Runtime outputs
remain outside tracked source, and no provider calls or paid usage occur.
