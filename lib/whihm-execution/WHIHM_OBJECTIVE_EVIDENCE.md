# Objective Creative QC extensions

Creative QC request/result v1 now accepts `objective_measurement` rules. Existing
inspection, benchmark metrics, exact recorded evidence checks, authored lineage,
immutable project asset storage and source integrity remain authoritative.
No additional capability or host API is introduced. Explicit QC evaluation is
the control surface; planning performs no frame decoding.

Example rule:

```json
{"type":"objective_measurement","family":"timeline","itemId":"reveal",
 "metric":"startFrame","operator":"lte","value":42,"tolerance":0,"unit":"frames"}
```

Operators: `eq`, `lte`, `gte`; tolerances are explicit finite nonnegative numbers.
Families `timeline` and `audio` read registered output production metadata only,
under the existing `allowRecordedDeterministic` policy. They describe authored
structure, not measured perceptual facts. Item IDs resolve exactly. Missing facts
yield `observed.status: UNVERIFIED`, a REVIEW finding and human-review state;
they never become numeric zero or FAIL. Checks include start/end/duration,
source trim, gain/pan, fade-in/out, pitch semitones, stretch ratio (source frames
divided by output frames), master gain, canvas dimensions and Timeline layer order.
Absent default fields remain unverified. Overlay items use the same stable IDs;
authored overlay timing/order does not establish visibility or legibility.

Family `visual` supports `changeCount` (count), `meanActivity`, `meanLuminance`,
`meanContrast`, `blackFraction`, `whiteFraction` (ratios). Family `segment`
reuses the same bounded samples and supports change-derived `changeCount`, `segmentCount`,
`averageSegmentDuration`, `minimumSegmentDuration`, `maximumSegmentDuration`,
`medianSegmentDuration`, `firstSegmentDuration`, `lastSegmentDuration`,
`openingChangeCount` and `openingAverageSegmentDuration`. Specify `startFrame`,
`frameCount`, `stepFrames` for both families. The shared approved FFmpeg
lease/process primitive decodes the first video stream into 32x32 grayscale
samples. No new FFmpeg runtime or model is installed. Full-range grayscale bytes
are normalized to 0–1; contrast is population standard deviation. Black/white
thresholds are <=4 / >=251. Activity is mean absolute pixel difference between
successive samples. Change candidates occur at sampled differences >=0.25. This
detects pixel changes, including flashes and fades, not semantic shots or camera
motion. Sampling can miss changes between samples. A candidate is localized only
to its preceding sample interval; step=1 locates synthetic hard changes at the
decoded frame.

Change-derived segment convention is deterministic: segment 0 starts at frame 0,
each detected change candidate starts the next segment, and the final segment ends
at the exclusive terminal sampled frame. Durations are therefore sampled-frame
intervals converted to Timeline-frame units. A static clip has one segment; zero
or one changes are not special-cased into a semantic shot claim. Consecutive
changes produce the corresponding short intervals. These are explicitly
`change-derived` segments, not editor-authored or semantic shot boundaries.

Limits: 2–120 samples, 1–30 frame step, at most 120 source frames and 3 seconds
per window, start at or before frame 1800, eight distinct windows per QC call.
Each decode has a 15-second timeout, fixed threads, memory/output limits and no
network protocols. Decode begins at source origin, bounded by the start-frame
limit. Windows are shared across metric requirements. Input media remains subject
to existing project import limits. VFR samples refer to decoded frame ordinals;
no claim of wall-clock equivalence is made. Audio/image visual analysis is blocked
as unsupported; existing image metadata checks remain available.

The evidence v1 object is embedded in the immutable QC finding observation. It
contains source asset/checksum, sampling scope/rational rate, runtime versions,
units, samples, measurements, deterministic provenance and evidenceHash. No second
evidence database is created. Hashes exclude timestamps. Inputs are checksum
verified before and after decoding. New artifacts require new evidence/QC; old
records remain intact. Imported recorded evidence retains its existing explicit
trust classification and is never promoted by its self-declared contents.

Expected outcomes may include `id`, `artifactId`, and a typed `rule` alongside
`type: objective` and `description`. Creative Revision validates the resulting QC
request before planning, then appends these requirements to the fresh post-render
QC. IDs must be unique and artifact roles must already exist in the bound request.
Subjective descriptions remain descriptive and produce no deterministic rules.
Existing stream/metadata checks are still supplied directly as ordinary QC rules.

## Existing specialized evidence

Registered `face-landmarks` JSON from the existing MediaPipe guidance path is
normalized by the `face` family. It provides per-sample face presence/count,
normalized landmark bounds and `bbox`, centroid, bounding-box/face area, center distance,
first/last observation and persistence. The normalizer validates the pinned
478-point shape, coordinate ranges, frame/timestamp binding and source asset
checksum. It does not perform face inference. In the current Electron/WSL
environment live extraction remains blocked by `FACE_ELECTRON_RUNNER_UNAVAILABLE`;
that status is reported rather than replaced with fabricated facts.
Normalization accepts at most 600 supplied source frames (the existing bounded
guidance limit); explicit QC analysis windows remain capped at 120 samples.
Summaries describe sampled observations, not unsampled between-frame visibility.

Registered `subject-mask-sequence` JSON from the existing supplied-mask or explicit
segmentation path is normalized by the `mask` family. PNG bytes are decoded with
the existing `sharp` dependency and their per-frame checksum, dimensions and
source binding are verified. Facts include foreground area and bounding-box area,
pixel and normalized bounding box, normalized centroid, center distance, edge proximity, foreground/bounding-box
pixel counts, first/last observation, persistence and average/minimum/maximum
area (with target-prefixed aliases when a target ID is bound). A `target` rule is allowed only
when the evidence carries the same explicit canonical target ID (the evidence
reference, `operation.objectId`, or an equivalent trusted source). An unlinked
mask remains useful mask evidence but is `UNSUPPORTED` for target prominence; no
pixel-based object identity is guessed. Remote segmentation is never invoked by
QC.

The `audio_timing` family links an authored Audio Production event to the nearest
existing onset or beat candidate from a registered `ANALYZE_AUDIO_TIMING` result.
It reports the candidate, signed and absolute Timeline-frame/millisecond deltas,
candidate strength where supplied, and an explicit within-tolerance boolean.
No beat grid, downbeat, or intermediate candidate is invented. Missing candidates
produce `UNVERIFIED`, not failure. The `face`, `mask` and `target` families require
`sourceClass: specialized_model`; timing analysis requires
`sourceClass: recorded_deterministic` and the existing recorded-evidence policy.
For numeric delta rules, the candidate's `aligned` fact uses the declared rule
value plus tolerance in the declared unit; boolean alignment rules use their
explicit frame tolerance.
Timing evidence is only compatible with a registered audio source; face/mask/
target evidence rejects an audio-only source (the existing guidance path uses
video, while explicitly supplied still-image evidence remains caller-bound).
An incompatible media binding is reported as `UNSUPPORTED`/review rather than a
fabricated failure.

External directors consume the new rules through capability projection and
`evaluate_creative_qc`; `get_creative_qc` exposes measurements and requirement
results, including expected/measured/tolerance/unit. No credential access or
workflow mutation is added. Free measurements do not imply a creative failure;
only explicit requirement comparisons generate PASS/FAIL findings.

Depth is explicitly unsupported in this milestone because no authoritative
registered depth-evidence source exists in the current WHIHM architecture:
`DEPTH_OBJECTIVE_EVIDENCE_UNSUPPORTED_NO_AUTHORITATIVE_SOURCE`. A new depth model
or runtime is intentionally out of scope. Face normalization, trusted-mask
normalization, target prominence (with an explicit target), richer segment
statistics and onset/beat linkage are implemented over existing evidence.
Specialized measurements carry specialized provenance and are checksum/staleness
bound exactly like source artifacts. Raw measurements alone are evidence; only a
typed requirement comparison creates an objective finding. No subjective scores
or confidence claims are derived from these metrics.
