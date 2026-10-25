# Deterministic media capability audit

Inspected 2026-10-25 against source baseline `101a95df70746cadd74dfc58ad0f0fc9977eaca0`.
Repository, checked-out submodules, locked dependencies and installed runtime file
names were inspected read-only. No provider queries, model runs, media processing,
installations, downloads or external Wan2GP-installation scans were performed.
The accompanying host changes only persist existing production-state transitions.

## Live provider audit follow-up

The [2026-10-25 live MuAPI capability audit](MUAPI_MEDIA_CAPABILITY_AUDIT.md)
extends this local-source snapshot without replacing it. It inspected public
catalogs, schemas, workflow definitions, MCP discovery and non-generating price
quotes. MuAPI confirms free PIL/FFmpeg watermark insertion, ordered Video Combiner
and Suno-specific WAV conversion; image watermark and Suno WAV already have
existing application/WHIHM routes. Prefer those bounded remote contracts over
rebuilding equivalent tools. No generic probe or exact timeline/export contract
was established. The FFprobe-first recommendation remains, with narrower rationale;
FFmpeg finishing remains incremental and optional. Protected metadata and backend
timing/audio/repeatability remain unverified. See the companion for evidence,
pricing caveats, capability classifications and the revised local-versus-remote matrix.

## Executive assessment

Open Generative AI already supplies a reusable remote Video Combiner UI/service
path, generation/upload/polling clients, browser playback/download and some image
canvas operations. WHIHM supplies the canonical graph, project asset/export storage,
history, approval/readiness and a utility execution extension point. Keep these.

There is **no implemented local generic finishing runtime** in the inspected source:
no CLI media probe, exact trim, timeline renderer, audio mixer or video overlay/export
engine. A WHIHM Video Combiner in fixtures/tests is a declaration, not an executor.
Cinema Studio is cinematic image prompting, not a multi-clip finishing studio.

The upstream `video-combiner` is a remote utility. Its bundled schema supports ordered
clip URLs and aspect ratio, but encoding/timing/backend implementation is absent.
Calling it deterministic is a category-level intention, not a verified repeatability
guarantee. Preserve it for suitable online jobs; it does not establish offline,
frame-exact assembly or replace a generic local finishing path.

FFmpeg is present **indirectly** as Electron's installed Linux `libffmpeg.so` media
library. This is not an FFmpeg/FFprobe command or exposed editing API. No FFmpeg/
FFprobe executable/wrapper dependency is declared in the inspected npm/Python
manifests/locks, and neither command exists on this session's PATH. External
Wan2GP may use FFmpeg; this repo only launches Wan2GP and parses its output.

## Evidence index

Paths below are repository-relative; symbol names are the lookup anchors. These
sources establish implementation, not live service availability or output quality.

| ID | Exact source / symbol | Confirmed evidence |
| --- | --- | --- |
| E1 | `packages/Vibe-Workflow/packages/workflow-builder/src/components/VideoCombiner.jsx`: `handleRunSingleNode`, `pollNodeStatus`; `utility.jsx`: `videoCombinerModels` (~663), `downloadFile` (~824) | `video-combiner`, `videos_list` (bundled max 20; description 5–60s per clip), aspect ratio; remote node-run/status/signed download; dynamic schema may differ |
| E2 | `src/lib/workflow-desktop/transport.mjs`: `adaptWorkflowRequest`; `vite.mjs`: builder Axios alias; `app/api/workflow/[[...path]]/route.js`; `packages/Vibe-Workflow/server/app/utils/workflow_helper.py`: `proxy_request_helper`, `run_node_helper` | Desktop routes `/api/workflow/*` to MuAPI; Next/Python routes proxy remotely; none implements video assembly |
| E3 | `packages/studio/src/muapi.js`: `submitAndPoll`, `uploadFile`, `runSingleNode`, `getNodeStatus`, `calculateDynamicCost`, `runClipping`, `runMotionGraphics`, `upscaleImage`, `removeBackground`; `utils/generationLifecycle.js` | Shared service/lifecycle and AI media operations, not local encoding |
| E4 | `packages/studio/src/components/DrawModal.jsx`: merge canvas in generation handler (~945–1018) | Background + images at explicit x/y/size + drawings + wrapped text; JPEG 0.92 then upload and AI edit |
| E5 | `packages/studio/src/components/LayersStudio.jsx`: `getColorGradingCSSFilter` (~223), `handleDownloadGradedImage` (~1072), `handleDownloadSingle/All` (~1240) | Canvas filter/vignette PNG export; grain uses `Math.random`; layer downloads fetch original blobs individually |
| E6 | `src/lib/uploadHistory.js`: `generateThumbnail`; `packages/studio/src/components/CinemaStudio.jsx` / `MobileGenerationActions.jsx`: `fetchImageAsPngBlob` | 80×80 center-crop JPEG thumbnail; full-size canvas PNG conversion for clipboard |
| E7 | Builder `VideoPlayer.jsx`, `AudioPlayer.jsx`; Studio `AudioStudio.jsx`: `PremiumAudioPlayer`; `ClippingStudio.jsx`: `seekToHighlight`; desktop `src/components/VideoStudio.js`, `LipSyncStudio.js` | HTML media duration/seek/playback/mute/volume; audio visualizer uses random heights, not waveform/beat analysis |
| E8 | `packages/studio/src/utils/downloadImage.js`; builder `utility.jsx`: `downloadFile`; Studio `ClippingStudio.jsx`: `downloadVideo` | Fetch → Blob → download anchor; MIME-aware image filenames; remote signed URLs; naming `.mp4` does not transcode |
| E9 | `electron/lib/localInference.js`: `generate`, `arToDimensions`; `modelCatalog.js`; `src/lib/localInferenceClient.js` | sd.cpp image generation to PNG, model/seed/sampler/dimensions, binary/model management; no video finishing |
| E10 | `electron/lib/wan2gpLocal.js`: `runGeneration`, `spawnWgp`; `wan2gpProvider.js`, `wan2gpCatalog.js`, `wan2gpMcp.js`; `wan2gpOutput.js`: `findSavedPath`, `summarizeRun` | External `wgp.py --process`, optional remote MCP, settings/progress/result files; comment mentions FFmpeg children/remux but implementation is external |
| E11 | `lib/whihm-execution/runtime.mjs`: `routes`, `resolveExecutionBinding`; `bridge.mjs`: `createExecutionBridge` | Remote/local bridge; single injected utility `{tool,validate,run}`; no built-in media utility executor, no direct remote-combiner route |
| E12 | `packages/whihm-workflow-core/src/project/store.js`: `importAsset`, `generateExportPath`, `recordExport`, `exportProjectData`; `project/io.js`: `MAX_IMPORT_BYTES`, `local`, `atomic` | Portable registry, safe paths, checksums, directory transfer and export metadata; 64 MiB asset-import limit; whole-file reads |
| E13 | Core `schema.json`, `src/validate.js`, `diff.js`, `production.js`, `history/store.js`; `fixtures/heterogeneous-media.json`; `tests/edit.test.js` combiner construction | Typed dynamic graph and declarative heterogeneous utilities; hashes/history/approvals; no media execution |
| E14 | Root `package.json`, `package-lock.json`; package/submodule manifests/locks; Python `requirements.txt` / `pyproject.toml`; `Dockerfile`, `afterPack.js`, `scripts/stage-local-ai-binary.js` | Electron 33.4.11, Next 15.5.15, optional Sharp 0.34.5; no declared FFmpeg/FFprobe wrapper; packaging includes `dist`/`electron` and optional `build/local-ai` resources |
| E15 | `packages/studio/src/models.js`, `videoToolCapabilities.js`, `videoModelParameters.js`, `seedanceModels.js`, related model-family files | Remote model-specific duration/resolution/audio options, video edit/extension/upscale/watermark-removal/translation; audio model sample-rate/bitrate/channel options (~33402, ~34977). These govern AI output, not generic existing-file conversion |
| E16 | `packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx` (~1820); its `server/app/routers/creative_agent_router.py`; agent server requirements | `concat_videos` is a tool-result icon; creative-agent calls proxy remote jobs. No local concat implementation hidden behind that name |
| E17 | `src/lib/muapi.js`, `src/lib/pendingJobs.js`; `packages/studio/src/imageSizing.js`, `modelCapabilities.js`, `videoMediaInputs.js`; `src/lib/workflow-desktop/image.jsx` | Existing desktop generation client/pending-job storage and pure parameter-size/media-input normalization; desktop image wrapper renders `<img>`, not Next server image optimization |
| E18 | `packages/studio/src/components/McpCliStudio.jsx` | Instructions/links to external `muapi-cli`, remote MuAPI MCP and skills; not an embedded local media processor or proof those external packages are installed |

Searches covered `src`, `lib`, `electron`, `app`, scripts/build config and all checked-out
packages/submodule servers. Searches for FFmpeg/FFprobe, MoviePy, PyDub, media probe,
WebCodecs, MediaRecorder and audio-context/encoder usage found no generic local
finishing implementation. Installed `node_modules/electron/dist/libffmpeg.so` was
confirmed by filename. Root lockfile lists Sharp as Next's optional dependency;
`node_modules/sharp/package.json` is installed here. No Sharp transformation call
was found in application code. A transitive package's availability is not a supported
desktop application contract. No private MuAPI backend or external model install was inspected.

## Capability classification matrix

Classes: REUSE_AS_IS / WRAP / EXTEND / REPLACE / MISSING / NOT_NEEDED.
Domains below distinguish deterministic local, remote service, AI local/remote and
browser-only. “Missing” means no implemented generic capability found in this scope.

| Capability | Existing implementation / domain | Class | Quality / concrete gap |
| --- | --- | --- | --- |
| Duration | HTML video/audio metadata (E7), browser-only | WRAP | Adequate player duration; no authoritative stream/timebase probe |
| Image dimensions | Image natural dimensions / canvas (E4–E6), browser-only | WRAP | Existing image-size reads; no shared probe record |
| Video dimensions | HTML video playback exists (E7) | EXTEND | No shared extraction/validation helper found; CSS sizing is not media metadata |
| FPS, codec, audio streams, timebase, rotation, full metadata | No structured probe (E7, E14) | MISSING | Must inspect actual files before timing/normalization decisions |
| Exact video trim | No local executor; clipping highlight seek is playback (E3,E7) | MISSING | AI clipping is content selection, not exact in/out trim |
| Concatenate clips | Remote `VideoCombiner` (E1,E2), service utility | WRAP | Existing online ordered concat path; backend determinism/codec handling unverified |
| Reorder clips | `videos_list` order (E1); canonical parameters (E13) | WRAP | Reuse ordered representation; no local render implementation |
| Clip transitions | No finishing implementation | MISSING | CSS transitions and generative scene transitions are not rendered timeline transitions |
| Speed/retiming | No finishing implementation | MISSING | No media output operation; generation duration is not retiming |
| Frame-rate conversion | Model-specific generation choices only (E9,E10,E15) | MISSING | No conversion of existing media |
| Video scaling | Aspect ratio in remote combiner (E1), generative sizes (E15) | EXTEND | No exact generic pixel geometry/resampler contract |
| Video crop / pad / orientation / aspect conversion | Remote combiner aspect ratio only (E1) | MISSING | Crop vs fit/pad and rotation behavior unspecified; exact local primitive absent |
| Still-image duration / image-to-video composition | AI I2V exists (E3,E15) | MISSING | A fixed still held for N frames is not AI animation |
| Audio mux/demux / extraction | No generic implementation | MISSING | Lip sync / `generate_audio` do not establish stream-copy/mux controls |
| Audio trim | No file operation found | MISSING | Player seek is not editing |
| Audio volume | Player `.volume` (E7), browser-only | EXTEND | Playback control exists; no rendered gain/normalization |
| Fade in/out / crossfade | No audio processing found | MISSING | No render/filter contract |
| Multi-track mixing | No deterministic mixer found | MISSING | Generating music is not mixing existing tracks |
| Sample-rate / channel conversion | No audio conversion found | MISSING | No stream format normalization |
| Generated-audio sample rate / bitrate / channels | Audio model schemas + `generateAudio` (E3,E15), AI remote | REUSE_AS_IS | Keep existing supported model controls; not resampling/remuxing an arbitrary existing track |
| Silence insertion / timing alignment | No deterministic implementation | MISSING | Must explicitly represent optional tracks and gaps |
| Static image/logo composition | DrawModal canvas merge (E4), browser-only local computation | WRAP | Explicit pixel positioning/size exists, but tied to React state and AI submit; JPEG loses transparency |
| Image opacity/blending/color effects | Layers canvas filters/vignette/grain (E5), browser-only | EXTEND | Core filter math can be adapted; unseeded random grain is not repeatable |
| Timed video logo/opacity/position | No video compositor | MISSING | Static canvas drawing/preview opacity cannot render timed video overlays |
| Text drawing | DrawModal wrapped `fillText` (E4), browser-only | WRAP | Static text exists; fonts/metrics/color may vary across environments |
| Subtitles / video text burn-in | No deterministic subtitle renderer found | MISSING | Remote translation/AI clips do not establish a local subtitle/export contract |
| Watermark application | Possible static image overlay using E4 | WRAP | No packaged WHIHM operation; video/timed application missing |
| Watermark removal | Remote video model/tool catalog (E15), AI remote | REUSE_AS_IS | Preserve upstream feature; not deterministic restoration or watermark application |
| Output resolution / FPS | Generation settings (E9,E10,E15) | EXTEND | Reuse model controls for AI; need independent deterministic export validation |
| Codec / bitrate / container / encode quality presets | No generic exporter; blob downloads (E8); some remote audio output controls (E15) | MISSING | File extension does not set encoding; model options do not establish a generic render preset implementation |
| Hardware encode acceleration | No local finishing encoder/binding | MISSING | sd.cpp GPU acceleration is AI compute, not proven NVENC/QSV/video export |
| Register output in project | `generateExportPath` / `recordExport` (E12), deterministic local Node | REUSE_AS_IS | Safe output location/hash registry already exists; not a renderer |
| Import assets / portable data copy | Project import/export (E12), deterministic local Node | EXTEND | Reuse safety/identity; 64 MiB import and whole-file checksumming need video-scale work |
| Ordered timeline | Remote combiner list / canonical utility params (E1,E13) | EXTEND | No generic clip-in/out, overlaps, tracks, optional events or render implementation |
| Frame-exact placement, overlaps, multiple audio events, deterministic replay | No timeline renderer | MISSING | Typed graph/positions are not a timeline/timebase; do not infer time from canvas positions |
| Image thumbnail / preview | 80×80 JPEG (E6), browser-only | REUSE_AS_IS | Good small upload preview; lossy, not a production master |
| Video/audio preview | Existing media players (E7), browser-only | REUSE_AS_IS | Keep UI; no need another player for this milestone |
| Waveform / beat analysis | Random bar animation only (E7) | MISSING | Animation cannot feed QC, beat placement or audio timing |
| Video frame extraction | No extraction helper found | MISSING | Player seeking alone is not a deterministic extraction service |
| Image conversion | Canvas PNG/JPEG serialization (E4–E6); optional Sharp installed (E14) | WRAP | Existing browser helpers useful; Sharp has no app-owned contract or desktop packaging |
| Media/container format conversion | No implementation | MISSING | Downloading/suffix changes do not transcode |
| Canonical IDs/deps/approval/hash/history | WHIHM core (E13), deterministic local | REUSE_AS_IS | Keep authoritative dynamic graph and evidence; no new workflow format |
| Utility extension boundary | Existing bridge injection (E11) | WRAP | Suitable small entry point; no new provider registry/scheduler required |
| Model input geometry/media request normalization | Existing sizing/capability helpers (E15,E17), deterministic pure JS | REUSE_AS_IS | Useful AI request contracts; not pixel resampling or a media-file probe |
| External CLI/MCP instructions | Existing Studio instructions (E18), remote integration guidance | REUSE_AS_IS | Keep existing discovery/integration surface; external/private tool implementations unverified |
| New editor, duplicate uploader/poller/history, generic shell IPC | Existing upstream/core facilities (E2,E3,E11–E13) | NOT_NEEDED | No demonstrated gap warrants replacement or parallel infrastructure |

No whole upstream system warrants REPLACE. The random grain output specifically
cannot be reused unchanged as a repeatable deterministic effect; seed it only if
that optional effect becomes an actual requirement. AI tools remain valuable and
should not be replaced with pretend deterministic equivalents.

## Deterministic versus AI, and tool-level quality/portability

Performance/quality observations below are code-based expectations, not benchmark
or rendered-media test results. No model result was generated or visually graded.

| Tool / owner | Domain; offline/network/payment | Reuse, quality/performance, maintenance | Windows/packaging/security implications |
| --- | --- | --- | --- |
| Video Combiner / upstream submodule | Remote service utility; network + API key; cost calculator present, actual price unknown | WRAP; simple online concat; exact timing, stream policy and repeatability unverified; service latency/upload costs; remote API maintenance | Desktop transport already adapts calls; keep optional online path. Media leaves device; backend/version retention not controlled here |
| Studio generation, V2V, recast, motion control, lip sync, upscaling, background removal, decomposition, AI clipping, motion graphics / upstream | AI remote; network; potentially credit-charging | REUSE_AS_IS; model-specific output quality and runtime unmeasured; preserve catalog, uploader and lifecycle | Already supported renderer service path; credentials remain outside project; licensing/cost vary by selected model |
| sd.cpp / upstream Electron | AI local, offline after binary/weights installed; no per-job provider billing | REUSE_AS_IS; seeded AI is not generic deterministic media editing; hardware-dependent generation quality/time; existing download/progress handling | Existing Windows binary selection; weights/runtime/caches separate from project; no weights run/downloaded here |
| Wan2GP / upstream Electron external integration | AI local via external Python install or remote MCP; may download on first run; remote billing unknown | REUSE_AS_IS; do not repurpose generation launcher as a media processor; external version/weights/VRAM/performance unverified | User-configured paths/Python are machine-specific and must be reconnected. FFmpeg children/remux mentioned, but no independently exposed tool to reuse safely |
| DrawModal / upstream | Browser-only local raster operations followed by remote AI upload/submit | WRAP math/composition only when needed; explicit geometry, JPEG 0.92 intermediate, no alpha master; whole-canvas RAM cost; React-state coupling | Works in renderer but CORS/tainted canvas and font availability matter; do not invoke its generation handler as a deterministic utility |
| Layers color grading / upstream | Browser-only canvas; remote source fetch when URL-based; local save itself no provider cost | EXTEND only for an actual still-image effect task; CSS filter approximation, not a proven color-managed/LUT pipeline; unseeded grain breaks repeatability | No video encoder; texture/font/browser variation; downloading layers individually is not flattened timeline export |
| Thumbnail/PNG conversion / upstream and desktop helpers | Browser-only deterministic-style raster transform; local File can be offline, remote URL fetch requires network | REUSE/WRAP; adequate previews/clipboard; compression/color conversion not promised bit-exact across Chromium versions | Retain existing UI helpers; do not depend on localStorage as portable project storage |
| Sharp / Next optional dependency | Potential deterministic local image tool; currently no application processing path | WRAP candidate, not confirmed app capability; no quality/performance benchmark; promote to supported pinned runtime dependency only if actually chosen later | Platform-native optional packages are in lockfile, but current desktop `files` list does not establish shipping Sharp; do not copy this machine's node_modules |
| Electron libffmpeg / runtime | Browser media playback support; installed shared library, not CLI | REUSE_AS_IS for playback only; cannot call it as `ffmpeg`/`ffprobe`; no observed editing API | Linux `.so` is not a Windows executable; inspect target codec/runtime distribution separately; media parser patching follows Electron maintenance |
| Project export/asset APIs / WHIHM | Deterministic local Node, offline, no provider payment | REUSE safety and registry; EXTEND import capacity/streaming when large media is introduced; current all-file integrity reads can be costly | Project-relative storage already relocates; reject symlinks/traversal, verify hashes. Trusted host may resolve transient absolute paths; never persist them |
| Production/history/bridge / WHIHM | Deterministic local control, passive evidence | REUSE_AS_IS; graph is dynamic, result hashes externally supplied, no media QC/encoder | Preserve context isolation and fixed operations; new tool processing must stay in trusted host, not raw renderer fs/shell |

Browser-only does not mean inherently online: the transform can use local pixels.
The current UI handlers may nevertheless fetch remote inputs or submit AI jobs.
Likewise an upstream model exposing resolution/FPS does not establish deterministic
conversion of an arbitrary existing file. Remote combiner cost/quality/operation
internals remain UNVERIFIED without backend evidence; this audit made no live call.

## Smallest generic optional primitive set

Use independently composable capabilities; a workflow may use zero or many of them.
No fixed clip count, references, music, logo, image-edit or video stage is required.

1. **Inspect media**: typed duration/timebase/stream/geometry/rotation information and
   content identity. The planner must know what file actually exists.
2. **Select/normalize media**: exact clip ranges, optional frame extraction or still
   duration, geometry/FPS/audio-format normalization. Make operations explicit.
3. **Assemble ordered video**: arbitrary clip lists; start with hard cuts and explicit
   time units, optional gaps/stills; retain remote concat for jobs its schema can satisfy.
4. **Compose optional layers**: visual placement/opacity/time ranges and independent
   audio events with offsets, trim, gain, fade and mix. Neither track type is mandatory.
5. **Encode or copy final artifact**: explicit validated output settings or byte-preserving
   pass-through when no transform is needed. Image-only and text→image jobs must not
   be forced through a video pipeline. Register using existing project APIs.

A future timeline renderer should compile these primitives, not define another
canonical workflow graph. Explicit media timing is distinct from editor positions.
Transitions, subtitle burn-in, advanced looks and beat analysis are optional extensions.

## Concrete gaps by priority

**MUST HAVE before claiming generic deterministic finishing:** reliable file probe;
host-side safe execution/cancellation with constrained arguments; supported binary
version/capability discovery; exact timing conventions; trim/geometry/format
normalization; arbitrary ordered assembly; optional audio mux/mix and visual overlays;
validated encoding/pass-through; successful-output checksum/project registration.
Reuse existing IDs, assets, registry, history and utility boundary. Stream large files
and address the 64 MiB import cap before production-scale video imports.

**SHOULD HAVE:** frame-accurate/variable-FPS policies, rotation handling, silent-source
handling, deterministic preset/version recording, output probe/QC, resource/time limits,
atomic final output publication, error sanitization, Windows path/Unicode tests,
portable asset references, cancellation cleanup without deleting source media.

**NICE TO HAVE:** crossfades and complex transitions, subtitles/fonts, waveform/beats,
seeded grain/LUT/color management, hardware encoding, advanced multi-layer effects.
These should not delay a small probe-first milestone or become mandatory workflow stages.

## Portability implications

- The final installed app and portable project data are different artifacts. Keep
  provider credentials, caches and optional model installations out of project archives.
- Current desktop packaging lists `dist/**/*` and `electron/**/*`, plus `build/local-ai`
  as extra resources (E14). The previously documented WHIHM source/core packaging gap
  remains; this task does not fix it. No finishing binary is staged by those scripts.
- For reliable offline finishing on another Windows PC, a supported versioned FFmpeg/
  FFprobe pair must eventually be bundled or explicitly installed/verified by setup;
  PATH on this development machine and Electron's shared codec library are insufficient.
- A future binary choice needs actual codec/filter validation and redistribution/license
  review for that exact build. No current source evidence establishes those capabilities.
  Hardware encoders cannot be presumed available on another GPU/driver.
- Existing sd.cpp resource staging and argument-array process management offer patterns
  to adapt, not a reason to change local inference engines or reuse model directories.
  Never expose arbitrary process arguments, URLs, filters or filesystem writes to renderer IPC.

## Exact next implementation recommendation

Implement **one nonvisual, project-scoped media inspection milestone**, not assembly:
reuse project handles/asset validation and fixed IPC; define a small typed FFprobe JSON
result and safe tool-resolution boundary; allow an explicitly supplied compatible binary
for development without downloads; validate version/presence and inspect only registered
project assets using argument arrays, time/output limits and structured errors. Test
duration/dimensions/rational FPS/codecs/audio streams/rotation with tiny fixtures and
mock process output; test missing executable, traversal, unsupported media and no-network
behavior. Record capability version/provenance without absolute canonical paths.

Reuse project/core/history/approval code, existing generation clients, players and
downloads unchanged. Wrap the existing bridge utility boundary for future local tools.
Extend large-file import/checksum behavior in a separate bounded storage task before
large real videos. Do not build a new editor, model catalog, polling engine or scheduler.

FFmpeg/FFprobe is a reasonable proposed toolchain because no adequate local equivalent
is exposed here; FFprobe is needed first for inspection, FFmpeg later for exact transforms.
This is an architectural recommendation, not a claim that those executables are installed
or that every codec/filter is already available. Preserve MuAPI Video Combiner as an
optional remote utility; its restricted online contract should not be silently expanded
or replaced, and it cannot satisfy the unimplemented local timeline/audio/export requirements.
