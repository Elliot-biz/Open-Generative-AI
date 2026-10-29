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
`meanContrast`, `blackFraction`, `whiteFraction` (ratios). Specify `startFrame`,
`frameCount`, `stepFrames`. The shared approved FFmpeg lease/process primitive
decodes the first video stream into 32x32 grayscale samples. No new FFmpeg runtime
or model is installed. Full-range grayscale bytes are normalized to 0–1; contrast
is population standard deviation. Black/white thresholds are <=4 / >=251.
Activity is mean absolute pixel difference between successive samples. Change
candidates occur at sampled differences >=0.25. This detects pixel changes,
including flashes and fades, not semantic shots or camera motion. Sampling can
miss changes between samples. A candidate is localized only to its preceding
sample interval; step=1 locates synthetic hard changes at the decoded frame.

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

External directors consume the new rules through capability projection and
`evaluate_creative_qc`; `get_creative_qc` exposes measurements and requirement
results, including expected/measured/tolerance/unit. No credential access or
workflow mutation is added. Free measurements do not imply a creative failure;
only explicit requirement comparisons generate PASS/FAIL findings.

Deferred: face extraction/normalization (current Electron limitation remains
FACE_ELECTRON_RUNNER_UNAVAILABLE), trusted-mask centroid/bounds/persistence,
specialized evidence normalization, depth, semantic identity, shot segmentation
statistics and beat-candidate linkage. Existing guidance mask coverage and
audio-timing candidates remain available through their original evidence paths.
No remote segmentation is automatically invoked. No subjective scores or
confidence claims are derived from these metrics.
