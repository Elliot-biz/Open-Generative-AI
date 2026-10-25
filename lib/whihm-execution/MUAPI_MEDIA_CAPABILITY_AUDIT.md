# Live MuAPI media capability audit

Companion to [the local-source audit](DETERMINISTIC_MEDIA_AUDIT.md). Inspected
2026-10-25, beginning **15:02 UTC**, against local source commit
`4222b3df0fd8cefb4928e5d11f0812378d95e374`. This records a point-in-time provider
surface, not a promise that endpoints, prices or schemas will remain unchanged.

## Executive decision and evidence limits

**PARTIAL:** live discovery was extensive and adds concrete reuse opportunities,
but protected agent-skill discovery returned 403 and backend precision, audio
retention and repeatability were not verified by execution. No generation was
necessary or authorized to resolve those unknowns.

MuAPI exposes conventional **image watermark application (PIL)** and **video
watermark application (FFmpeg)**, both advertised and preflight-quoted at $0, plus
**ordered Video Combiner** and **Suno-track WAV conversion**. Keep and reuse the
existing application implementations. The label `domain: ai` in the catalog does
not make watermark insertion generative; conversely, structured parameters do
not make AI cropping, upscaling or audio generation deterministic.

No generic media probe or exact editing/timeline/export contract was identified
in the inspected surfaces. This is **not proof that MuAPI has no private or
undiscovered implementation**. FFprobe remains a sound local inspection milestone;
FFmpeg remains justified for optional exact/offline finishing. Do not rebuild
simple remote watermarks or ordered online concatenation merely for ownership.

Evidence vocabulary:

- **CONFIRMED:** advertised field, price response, source binding or discoverable
  endpoint was observed. This does not certify the implementation behind it.
- **INFERRED:** a recommendation or conventional-operation classification supported
  by description/schema, without a backend execution test.
- **UNVERIFIED:** absent documentation, conflicting schemas, inaccessible surface,
  exact output behavior, latency, quality, repeatability or unpublished limits.

## Discovery, safety and reproducibility

Only first-party documentation, application-linked SDK repositories and provider
metadata were inspected. Full catalogs were searched, not just desktop model menus.
No third-party mirror was used. No packages were installed or executed as tools.

| Interface / source | Observation and coverage |
| --- | --- |
| [S1: OpenAPI](https://api.muapi.ai/openapi.json) | HTTP 200; 1,273 paths, 773 component schemas, reported API version 1.0.0. Paths and descriptions searched across all requested utility categories; selected request schemas resolved. |
| [S2: live models](https://api.muapi.ai/api/v1/models) | HTTP 200; 788 records, including 83 Video-to-Video and 25 Text-to-Audio records; searched names, descriptions, endpoint names and input fields. Counts are a snapshot, not a completeness guarantee. |
| S3: `GET /api/v1/models/{name}` | 52 successful detail/schema inspections listed individually below. Incorrect alias `runway-aleph` returned 404; actual ID is `runway-aleph-v2v`. |
| [S4: first-party discovery index](https://muapi.ai/llms.txt), [AI catalog](https://muapi.ai/.well-known/ai-catalog.json), [skill index](https://muapi.ai/.well-known/agent-skills/index.json) | Public HTTP 200. Skill index advertises model-discovery and coding-agent configuration guides; not additional evidence of a finishing engine. |
| [S5: template workflows](https://api.muapi.ai/workflow/get-template-workflows), [published workflows](https://api.muapi.ai/workflow/get-published-workflows) | 48 templates and 425 published listings searched. Alternate `/api/v1/get-template-workflows` also returned 48. Eight selected definitions inspected; one workflow node-schema catalog inspected (553 entries across six categories). No workflow was run. |
| [S6: public agent recipes](https://api.muapi.ai/api/v1/agent-skills) | 40 recipes listed; six recipe bodies inspected: music-video, product-showcase-video, character-story-video, ugc-ads-workflow, storyboard, product-ad-cinematic. Recipes carry generation credit estimates, not free execution rights. |
| S7: `GET /agents/featured/agents`, `/agents/templates/agents` | 28 featured and 37 template listings inspected for media/tool references. These are listing counts, not 65 distinct verified executable agents. No conversations created. |
| S7 restricted: `GET /agents/skills`, `/api/v1/creative-agent/agent-skills` | Both returned 403 publicly and with an existing application configuration key. Access/permission cause UNVERIFIED. No alternate credential acquisition attempted. |
| [S8: hosted MCP](https://api.muapi.ai/mcp), [MCP docs](https://muapi.ai/docs/mcp) | Public JSON-RPC `initialize` and `tools/list` succeeded: 20 tools. **No `tools/call`**, key-management, balance, top-up or generation operation invoked. |
| S9: `POST /api/v1/models/{name}/estimate-cost` | Six unauthenticated, non-generating preflight queries: combiner with 1/2/20 synthetic clip URLs; image watermark, video watermark and Suno WAV with empty quote payloads. S1 explicitly documents this as cost preview before generation. No media bytes supplied and no job IDs returned. |
| [S10: Video Combiner docs](https://muapi.ai/playground/video-combiner/api), [editing overview](https://muapi.ai/ai-video-editing-api), [API reference](https://muapi.ai/docs/api-reference) | First-party descriptions cross-checked against schemas. Marketing prices are not preferred over live request-specific estimates. |
| [S11: CLI](https://github.com/SamurAIGPT/muapi-cli), [MCP server](https://github.com/SamurAIGPT/muapi-mcp-server), [Video Utilities](https://github.com/Anil-matcha/Video-Utilities-API), [Speech-to-Text](https://github.com/Anil-matcha/Speech-to-Text-API), [Image Enhancement](https://github.com/Anil-matcha/Image-Enhancement-API) | Current README sources fetched read-only from application/provider-linked repositories. No installation, code execution or example generation commands run. |

The successful catalog, workflow, recipe, model-detail, MCP discovery and quote
queries required no authentication. An existing app key was used **only** for the
two protected GET metadata retries above. Its value was never printed, copied to
this document, or passed in a URL. No credentials were changed or persisted.
Research response copies stayed outside the repository; public workflow prompts,
user profiles, media URLs and agent owner data are intentionally not reproduced.

No generation/model submission, workflow run, agent invocation, upload, local
inference, media download, quote-triggered execution or paid call occurred. The
preflight responses demonstrate quoted prices, not actual charged job costs.

## Classification and common detail contract

Every detailed entry below has exactly one classification:

- `DETERMINISTIC_UTILITY`: conventional structured operation, not generative
  interpretation. This does **not** promise bit-identical encodes or frame accuracy.
- `CONTROLLED_AI`: AI transformation/analysis with constrained inputs.
- `GENERATIVE_AI`: primarily synthesizes new media or continuations.
- `UNKNOWN`: description/schema insufficient to establish semantics.

All detailed model entries were enabled (`is_enabled: 1`) when inspected. They are
remote services: network and accessible source URLs are required where URL inputs
are declared; no offline provider execution is established. Model catalog descriptions
saying "local processing" mean **provider-side** PIL/FFmpeg, not WHIHM's device.
Authentication and upstream asynchronous prediction handling remain unchanged.

For every entry: latency, measured output quality, bitrate, repeatability, retention,
backend version, and constraints not explicitly listed are **UNVERIFIED**. Family
names in the inventory are catalog groupings, not proof of a particular deployment
or vendor. No independent provider field was consistently supplied. Inputs/outputs
are schema declarations, not observed generated artifacts. Live `output_schema`
commonly wraps output in `id/status/output`; some old UI `output_data` schemas use
misnamed `video` fields for image/audio. Preserve upstream result handling and add
fixture coverage before relying on a single result key.

Prices below are catalog **base USD amounts**, with dynamic cost strategies; they
are not per-second/per-clip formulas or guaranteed request totals. Only the six
explicit preflight observations in the next sections were tested. A catalog price
of zero is not a guarantee about future fees, uploads, storage or access rights.

## Conventional utilities and Video Combiner deep dive

### Video Combiner: `video-combiner`

Sources: [live detail](https://api.muapi.ai/api/v1/models/video-combiner), S1, S5,
S9, S10 and existing `VideoCombiner.jsx` in the workflow-builder submodule.
Classification: **DETERMINISTIC_UTILITY** (INFERRED conventional concatenation from
explicit ordered-list contract; no prompt/model interpretation is exposed).
Backend implementation and encoding behavior remain UNVERIFIED.

| Property | Confirmed evidence / limit |
| --- | --- |
| Submission | `POST /api/v1/video-combiner`; not invoked during this audit. Existing builder executes its utility node via workflow node-run API instead of a separate WHIHM client. |
| Inputs | Required `videos_list`: array of source clip URL strings. OpenAPI URI items have max length 2083; local files need the existing upload boundary. No upload was attempted. |
| Ordering | Description explicitly says upload clips **in order**. Reordering array is the only exposed sequencing control. |
| Clip count | Live UI/detail schema `maxItems: 20`. No `minItems`; OpenAPI request also lacks `maxItems`. Practical minimum and server enforcement of maximum are UNVERIFIED. One-input quote is not execution validation. |
| Clip duration | UI description says **5–60 seconds per clip**. No corresponding OpenAPI numeric validation or duration input; enforcement UNVERIFIED. |
| Aspect | `auto`, `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`, `9:21`; default auto uses first clip's aspect ratio. Crop/scale/pad policy for mismatched inputs UNVERIFIED. |
| Output | `output.video` URL described as combined video; legacy workflow UI also declares `video`. Filename/container/codec not guaranteed by URL schema. |
| Total duration | No explicit output-duration control. Sum-of-clips is a reasonable concat expectation, **not a verified duration/frame guarantee**. No total duration limit documented in inspected schemas. |
| Trim/in/out; gaps; overlap | No fields exposed. Cannot promise any of these through this contract. |
| Transitions / stills | No transition or still-hold duration fields. Input contract says video URLs, not arbitrary stills. |
| Audio | Source audio retention, loudness, codec, crossfade, silent clips and multiple tracks all UNVERIFIED. No additional audio URL/track field. |
| FPS/resolution | Aspect control only; exact pixel dimensions/FPS not exposed. |
| Codec/container/bitrate | No controls exposed. |
| Pricing | Catalog base $0.05 with `video-combiner-cost`, dynamic=true. Safe preflights returned **$0.015 / $0.030 / $0.300** for 1 / 2 / 20 synthetic URLs. These samples suggest count-based $0.015/clip for those payloads, not a proven universal formula. Duration/resolution-dependent billing was not established. |
| Determinism | Structured concat intent supported; backend deterministic implementation, frame precision, encoding settings, byte-repeatability and cross-run reproducibility **UNVERIFIED**. |
| Latency / quality | UNVERIFIED; no render, download, audio or visual check performed. |
| Reuse | Keep existing builder/UI/desktop transport and workflow node-run/polling. WHIHM `findRemote('video-combiner')` has no direct route. `WRAP_MUAPI` for a bounded online concat node; do not substitute it for an exact timeline renderer. |

### Image/video watermark insertion

[`add-image-watermark`](https://api.muapi.ai/api/v1/models/add-image-watermark)
explicitly identifies PIL; [`add-video-watermark`](https://api.muapi.ai/api/v1/models/add-video-watermark)
identifies FFmpeg. Both classify as **DETERMINISTIC_UTILITY**. Provider description
is confirmed; output precision/quality is untested.

- Required source `image_url` or `video_url`, plus `watermark_image_url` (transparent
  PNG recommended). Return `output.image` / `output.video` URL respectively.
- Anchors: top-left, top-right, bottom-left, bottom-right, center. Opacity and relative
  scale supported. No exact x/y pixels, timed appearance, multiple-overlay timeline,
  arbitrary text payload or blend-mode controls exposed.
- **Schema drift:** live model UI declares opacity/scale as `int` despite fractional
  defaults and steps; OpenAPI uses numeric bounds (opacity 0–1, scale 0.1–1).
  UI scale default is .15; image OpenAPI/source catalog uses .2. Video OpenAPI also
  advertises width/height 256–1536, default 1024, absent from the live UI field list.
  Actual resizing/anchor geometry, alpha behavior, audio preservation and output
  codec/FPS are UNVERIFIED. Supply explicit validated settings rather than trusting
  inconsistent defaults; do not silently expose width/height as proven resize tools.
- Catalog base and safe empty-payload estimates: **$0 each**, strategy `watermark-free`.
  Empty quote acceptance is not proof that an empty generation request is valid.
- Image insertion already has an upstream I2I catalog/input contract and a WHIHM
  `i2i/generateI2I` binding. Reuse it; no replacement compositor needed for this
  limited online requirement. Video insertion already has upstream
  `V2V/processV2V`, but WHIHM bridge lacks V2V routing: extend only that existing
  route boundary when needed, not a new uploader/poller.
- Recommendation: `REUSE_MUAPI_AS_IS` for current image insertion; `WRAP_MUAPI` for
  exposing existing video insertion to canonical nodes. Exact/offline overlays
  remain a separate optional local capability.

### Suno WAV and existing YouTube captions

[`suno-convert-to-wav`](https://api.muapi.ai/api/v1/models/suno-convert-to-wav):
**DETERMINISTIC_UTILITY** conversion of an existing **Suno task_id + audio_id**.
No arbitrary `audio_url` input. Catalog and safe preflight $0.01. Output declared
as WAV audio; legacy UI/output schema naming is inconsistent. PCM bit depth,
sample rate, channel count and conversion latency UNVERIFIED. Already registered
in upstream Audio and WHIHM `audio/generateAudio`; `REUSE_MUAPI_AS_IS` when a Suno
artifact needs WAV. Does not replace generic transcoding/resampling.

[`seo-youtube-video-subtitles`](https://api.muapi.ai/api/v1/models/seo-youtube-video-subtitles):
**DETERMINISTIC_UTILITY** classification for retrieval of existing captions only.
Required YouTube video ID/URL; language/location/task options; optional translated
track requested by language. Translation mechanism/AI involvement **UNVERIFIED**;
this classification does not certify translation as deterministic. Catalog base
$0.01. No generic local media/subtitle extraction or cue burn-in. `DEFER` for WHIHM
production finishing until a real YouTube ingestion requirement exists.

## AI transformations, analysis and generative composition

The per-model inventory below preserves exact IDs, input fields, output fields,
controls and base cost. The following interpretation prevents false equivalence
with deterministic finishing:

| Family / exact representatives | Classification | Confirmed controls; limitation and strategy |
| --- | --- | --- |
| `autocrop` | CONTROLLED_AI | `video_url`, start/end time, target aspect; docs describe AI subject tracking. Not a guaranteed exact trim or fixed crop rectangle. `DEFER` until AI reframing needed. |
| `ai-clipping` | CONTROLLED_AI | Video + 1–60 highlights, aspect and `return_coordinates_only`. AI selects moments; coordinates-only is still AI selection, not exact user-provided ranges. Existing `runClipping` reusable. `DEFER`. |
| `ai-captions` | CONTROLLED_AI | Video, language, style/theme. AI recognition/animated captions; no user-supplied SRT/cue timing contract. Existing V2V catalog. `DEFER` for automatic captions; not deterministic subtitle burn-in. |
| `openai-whisper` | CONTROLLED_AI | Audio URL; language/prompt/temperature; json/text/srt/verbose_json/vtt formats. Speech timestamps possible through subtitle outputs, accuracy/word granularity unverified. `WRAP_MUAPI` only for optional transcription, not probe/sync ground truth. |
| `gemini-audio-vision`, `molmo2-video-captioner`, `ocr-recognize-text` | CONTROLLED_AI | Semantic audio/video descriptions or image text/positions. No measured BPM/waveform/codec report. Optional specialist analysis; `DEFER`. |
| `depth-anything`, `ai-background-remover`, `video-background-remover`, `ai-object-eraser` | CONTROLLED_AI | AI depth, segmentation, matting/inpainting. Video removal advertises ≤60s, preserve_audio and selectable output container/codec; this is AI matting with incidental export options, not a generic transparent compositor/transcoder. `DEFER`; reuse existing catalogs/services where present. |
| `ai-image-upscaler`, `seedvr2-image-upscale`, `ai-video-upscaler`, `ai-video-upscaler-pro`, Topaz variants, `flux-3-video-upscaler` | CONTROLLED_AI | Learned enhancement/refinement. Topaz video target_fps 16–60 and H264_output; neural processing is not established deterministic FPS conversion or speed change. Some image variants expose JPEG/PNG. `DEFER` new bindings; preserve existing upstream enhancement paths. |
| `video-watermark-remover`, `seedance-2-watermark-remover`, `seedance-2-video-watermark-remover-pro` | CONTROLLED_AI | Removal/inpainting, not reversible clean restoration. Seedance description advertises temporary free access while catalog base remains $0.025: price conflict requires request-specific quote. `DEFER`; never confuse removal with conventional insertion. |
| `luma-flash-reframe`, `runway-aleph-v2v`, `wan2.2-edit-video`, `seedance-2.5-video-edit`, `runway-act-two-v2v`, layer decomposition variants | CONTROLLED_AI | Reframing, guided visual/performance edits, AI layer inference; prompts/reference structure do not preserve pixels or exact timing. Existing V2V/decomposition paths should remain. `DEFER` for deterministic finishing purposes. |
| `ai-image-extension` | GENERATIVE_AI | Synthesizes outpainted content; not deterministic pad/fit. `DEFER`. |
| `seedance-2.5-video-extend`, `pixverse-v6-extend` | GENERATIVE_AI | New continuation frames; not still hold, looping or padding with existing frames. `DEFER`. |
| `mmaudio-v2-video-to-video` | GENERATIVE_AI | Prompt + video; duration 1–30s. Synthesized synchronized sound, not extraction, mux or existing-track mixing. `DEFER`. |
| `suno-remix-music`, `suno-extend-music`, `suno-generate-mashup`, `suno-add-vocals`, `suno-add-instrumental` | GENERATIVE_AI | New music/vocals/backing. Mashup accepts 1–5 source audios, but not gain/offset-controlled multitrack summation. `DEFER` as deterministic mix replacement. |
| `motion-graphics`, `motion-graphics-edit` | GENERATIVE_AI | Prompt-generated composition, reference images/videos, aspect and duration; edit uses prior request ID + instruction. No exposed deterministic timeline/render spec or pinned source/seed replay contract. Existing service/UI reusable for AI motion design; `DEFER` as renderer replacement. |
| `remix-video` | UNKNOWN | Video URL + aspect only; description says transform/resize but gives no backend or pixel/timing policy. `INSUFFICIENT_EVIDENCE`; do not call it deterministic resize. |

Unless a more specific decision appears above, the detailed controlled/generative
AI entries are `DEFER` for a new deterministic-finishing implementation: keep their
existing application paths, and expose additional bindings only for an actual
creative requirement. `heygen-video-translate` is `CONTROLLED_AI` translation/lip
adaptation, also `DEFER`; it is not conventional synchronization of existing tracks.
Additional advertised limits: Wan 2.2 edit accepts 480p/720p uploads up to two minutes;
Topaz creative video advertises up to 4x/4K. These are descriptions, not tested limits.
Suno mashup's description says 1–5 tracks but its live UI schema says maxItems=2;
actual accepted count is **UNVERIFIED**. Do not silently choose the larger limit.

Other live V2V catalog families (Kling/Seedance motion control and edits,
Happy Horse/Gemini Omni/Wan edits, lip-sync, additional extension tiers) are
AI transformation/generation alternatives, not missing evidence for FFmpeg-style
primitives. Their existence was catalog-checked; their many variants were not all
schema-audited. Pricing and limits must be discovered per selected model. First/
last-frame AI interpolation in Vidu generation descriptions does not establish a
conventional frame-interpolation or time-remapping API.

## Workflow, specialist-agent and MCP findings

Eight public graph definitions inspected via read-only
`GET /workflow/get-workflow-def/{id}`:

| ID | Finding / classification |
| --- | --- |
| `0e4042ae-4628-487f-b571-5dd9d598df22` | UGC template: vision/image-edit + Seedance reference-video pipeline; GENERATIVE_AI overall. |
| `09f6e93a-c5d6-465f-8e8b-a2d286e16332` | Product showcase: image input/edit + Seedance I2V; GENERATIVE_AI, not deterministic assembly. |
| `44f95b14-7810-4196-9734-513d6d76031c` | Character story: LLM/vision + image-edit + video generation; GENERATIVE_AI. |
| `f02d06aa-8dae-4f31-8b8f-91fec2b9ee27` | Single-clip reference generation; GENERATIVE_AI. |
| `0526af25-a458-4c3c-837c-0302f692fe39` | Multiple generated clips; GENERATIVE_AI, no exposed full timeline contract. |
| `1353180b-e9cd-4a76-8105-dd749b3b6b57` | Video passthrough + generated speech; GENERATIVE_AI overall, not confirmed podcast trim/mux tool. |
| `5001428d-a88a-426f-ac20-b050ac529b73` | Render Preview Clip: video generators/upscaler, Suno extension, prompt concatenator and **video-combiner**; GENERATIVE_AI overall with conventional utility component. |
| `5836b84e-af46-454f-a61a-5ec8c446c6b5` | Published generation graph includes **video-combiner** and prompt concatenator; GENERATIVE_AI overall. User title/prompts/media intentionally omitted. |

Graph selection was based on listing-name searches for trim/clip/concat/assembly/
render/audio/showcase/processing, with representative generation templates. This
is not an exhaustive inspection of all 473 listed graphs, nor a claim no arbitrary
user graph could encapsulate another operation.

The UGC workflow's live `node-schemas` response had categories text110, audio17,
image138, video277, utility7, api4. Utility entries: prompt-concatenator,
video-combiner, OCR, Depth Anything, YouTube publish/set-thumbnail/update-metadata.
Prompt concatenation and passthrough declarations are conventional data plumbing
(`DETERMINISTIC_UTILITY`), not media rendering. OCR/depth remain `CONTROLLED_AI`.
YouTube publishing/thumbnail/metadata mutations are conventional service operations
(`DETERMINISTIC_UTILITY`), but `NOT_NEEDED` for this finishing milestone and not
called. Thumbnail setting is not thumbnail extraction.

`audio-passthrough.make_input` mentions conversion for passthrough compatibility,
but exposes no format, sample-rate, channel or codec controls. Such incidental
conversion is **UNVERIFIED** and does not establish a generic transcode primitive.

Recipe `character-story-video` suggests a `concat_videos` tool; its underlying
endpoint/schema was **not** found under that name. The hosted MCP tools/list has
20 tools: search, image/video/audio/enhancement/lip-sync/clipping, prediction result,
upload and account/key/top-up tools. It does **not** expose concat/trim/probe/mix
in that list. Do not implement against a recipe's suggested tool name as proof of
availability. Video Combiner is the independently verified underlying concat surface.
Media-focused public agents mention Video Combiner; no verified hidden finishing
primitive was established. Restricted skill lists remain inaccessible. No agent
advice or recipe was executed.

CLI `run <model> -h` is documented as live OpenAPI introspection; curated verbs and
hosted MCP tool subsets are not the complete REST catalog. Prefer live schema
inspection for chosen operations rather than rebuilding catalogs or assuming a
missing desktop button means missing provider support.

## Local versus MuAPI decision matrix

"Not identified" below always means **in the inspected public metadata/docs and
selected graphs**, not a universal assertion about MuAPI. Existing local findings
are sourced from the companion local audit and are not re-audited here.

| Optional primitive / requirement | Local status | Live MuAPI status | Best current strategy |
| --- | --- | --- | --- |
| Probe duration/dimensions/rational FPS/codec/streams/rotation | No generic probe; player duration only | No generic structured probe identified | `BUILD_LOCAL`: project-scoped FFprobe; do not use semantic AI analysis for exact metadata. |
| Exact trim / extraction / per-clip in/out | Missing | Autocrop has start/end but AI reframe; clipping is AI selection | `BUILD_LOCAL` for exact ranges; `DEFER` AI highlight/reframe unless desired. |
| Ordered concatenate / reorder | No local encoder; upstream remote builder exists | Video Combiner list, max20 UI, aspect | `WRAP_MUAPI` for bounded online concat; retain local timeline roadmap for exact/offline needs. |
| Crop / scale / pad / rotate / orientation/aspect | Static browser image drawing only | Aspect choices in combiner/remix; AI crop/reframe/extension | `BUILD_LOCAL` for explicit pixel transform; `INSUFFICIENT_EVIDENCE` for remix as replacement. |
| Still hold / image-to-static-video | Missing | I2V generates motion; no static hold primitive identified | `BUILD_LOCAL` when requested; generation is not a hold. |
| Speed / retime / speed ramp | Missing | No conventional time transform identified | `BUILD_LOCAL` for explicit time mapping; `DEFER` nonlinear ramp complexity. |
| FPS conversion / frame interpolation | Missing generic converter | Topaz target_fps within AI enhancement; Vidu generative interpolation | `BUILD_LOCAL` for conventional FPS/timebase conversion; `DEFER` AI interpolation as separate quality option. |
| Video frames / thumbnails | Browser image thumbnails exist, no video extraction | No exact extraction endpoint identified | `BUILD_LOCAL` for frame extraction; keep existing preview helpers `NOT_NEEDED` to replace. |
| Mux/demux / audio extraction | Missing | MMAudio generates new sound, not extraction | `BUILD_LOCAL` when needed. |
| Audio trim/offset/gain/fades/crossfade/silence/resample/channels/loudness | Missing | No generic existing-track processing contract identified; Suno WAV restricted | `BUILD_LOCAL` composable exact audio operations; `REUSE_MUAPI_AS_IS` for Suno WAV only. |
| Multitrack / dialogue+music mix | Missing | Suno mashup/add-vocals/instrumental synthesize new content | `BUILD_LOCAL` explicit tracks/gain/offset mixing; keep generative music optional. |
| Image/logo watermark, whole image | Browser canvas exists; no standalone WHIHM operation | Free PIL utility, existing I2I bridge binding | `REUSE_MUAPI_AS_IS` for bounded online use; `USE_LOCAL_PRIMARY_MUAPI_FALLBACK` only where privacy/offline requirements warrant wrapping browser math. |
| Whole-video image/logo watermark | Missing local video compositor | Free FFmpeg provider utility, existing V2V service | `WRAP_MUAPI` before a like-for-like local implementation. No precise x/y/time/audio promise. |
| Exact/timed/multiple overlays, opacity keyframes | Missing | Watermark anchors/opacity/scale only | `BUILD_LOCAL` for explicit time/geometry; do not overextend remote schema. |
| Text/subtitle burn-in | Static canvas text only | AI Captions, Whisper SRT/VTT; no explicit cue-rendering contract identified | `BUILD_LOCAL` for provided text/cues; `WRAP_MUAPI` optional recognition separately. |
| Watermark removal / masks / depth / segmentation | Existing remote AI models | Controlled AI tools confirmed | `DEFER` new work; reuse existing application capabilities, never promise deterministic restoration. |
| Generic resolution/FPS/codec/container/bitrate/audio export settings | Missing | Settings within particular AI tools; no generic transcode/export contract identified | `BUILD_LOCAL` exact export primitive. Restricted WAV and H264 flags are not a generic exporter. |
| Ordered timeline, gaps/stills/overlaps/transitions, multiaudio/timed overlays | No renderer | Combiner only; generated motion graphics is a different contract | `BUILD_LOCAL` incrementally when product scope reaches timeline finishing; not a fixed mandatory pipeline. |
| Waveform / beats / BPM / scenes / silence detection / sync | Waveform UI decorative, no analyzer | Whisper speech cues, AI audio/video understanding; no dedicated measured beat/waveform/scene/silence/A-V alignment primitive identified | `DEFER` until needed; `BUILD_LOCAL` measured analysis rather than relying on AI guesses. `sync` on Autocrop means synchronous request mode. |
| Image conversion | Browser PNG/JPEG helpers, optional Sharp dependency | JPEG/PNG outputs of AI tools, no generic exact converter identified | `USE_LOCAL_PRIMARY_MUAPI_FALLBACK` only if the remote AI transform itself is desired; keep existing browser helpers otherwise. |
| Hardware encoding | No exposed finishing encoder | Provider backend hardware UNVERIFIED | `DEFER`; do not require GPU-specific export for portable correctness. |
| Output registration, canonical graphs/history/approvals, project transfer | Implemented WHIHM data/control APIs | Provider URLs/job IDs, not WHIHM portable data | `NOT_NEEDED` to replace: reuse WHIHM registration/safety and upstream download/client paths. |
| New editor/client/poller/scheduler | Existing upstream systems | Existing async API/workflow lifecycle | `NOT_NEEDED`: do not duplicate. |

## Quality, cost, privacy and portability tradeoffs

- Remote watermarking costs $0 at inspection and avoids shipping a new binary for
  that bounded task; it still needs network, uploads or accessible URLs, provider
  availability and data disclosure. Pixel geometry, source audio and re-encode
  quality require later explicitly authorized acceptance tests before production use.
- Combiner's sampled $0.015/clip is inexpensive for small online joins; still incurs
  transfer/queue latency (unmeasured), input restrictions and provider maintenance.
  Source codec/audio/FPS handling is not user-controlled. Keep the contract narrow.
- Local FFprobe/FFmpeg avoids per-run provider cost and supports offline/private,
  exact operations, but binary distribution, patching, validation, CPU time, disk
  usage and codec/filter licensing are real costs. No local-versus-remote quality
  benchmark was run. FFmpeg encoding itself can be lossy; choose explicit settings.
- AI transformation may improve imagery/audio but can change content, timing and
  identity. It is a creative/refinement option with separate quote/review policy,
  not a precision-edit fallback just because it exposes duration or resolution.
- Free provider utilities do not eliminate Windows portability work. Remote-only
  paths avoid media binaries but require reconnection/auth/network. Offline tools
  eventually require a verified Windows-compatible versioned binary distribution
  or an explicit setup step. Electron's codec library is not FFprobe/FFmpeg CLI.
- Application installation, credentials/cache and portable project data remain
  separate. Store relative asset references and content hashes; retain remote job
  IDs/source provenance where useful. No API keys in project/history/templates.
- All primitives are optional and composable. Text→image, text→video→export,
  reference→edit→video, existing clips→assembly, or graphs with no audio/logo/video
  are equally valid. No catalog recommendation mandates a production stage.

## Revised implementation decision

1. **Local FFprobe: yes.** No equivalent public structured probe was established.
   Keep the project-scoped, read-only inspection milestone from the local audit.
   Probe duration, rational FPS/timebase, dimensions/rotation, codec and audio
   streams without network. This is independent of whether finishing is remote.
2. **Local FFmpeg roadmap: yes, conditionally/incrementally.** Exact trim, generic
   mux/mix, timed overlays and controlled export are still unmet by inspected remote
   contracts. Do not build a giant finishing engine or mandatory fixed pipeline.
3. **Adequate bounded remote operations:** ordered short-video combine, static
   image/video watermark insertion, Suno-generated-track WAV conversion. Adequacy
   means exposed contract, not verified master-quality/audio/frame-exact acceptance.
4. **Wrap before local equivalents:** expose existing `processV2V` video-watermark
   path and existing builder Video Combiner service boundary when canonical access
   is needed. Image watermark and Suno WAV already have canonical runtime routes:
   reuse unchanged and add targeted fixtures, not replacement clients. No direct
   combiner binding or V2V bridge route currently exists.
5. **Still missing from demonstrated surface:** probe, exact trims, generic track
   mux/mix, exact-time/pixel overlays, generic transcode/export and arbitrary timeline.
   The provider may have other/private tools; do not claim universal absence.
6. **AI-only alternatives:** crop/highlights/captions, removal/matting/depth,
   upscaling/interpolation, reframe/edit/extend, generated audio/mashups and prompt
   motion graphics. Keep them distinct from deterministic assembly.
7. **Smallest next implementation task:** retain **one nonvisual registered-asset
   FFprobe inspection adapter**. Reuse project handles/path integrity and the existing
   utility boundary; explicit compatible development binary, no downloads; argument
   arrays, no arbitrary flags/paths, bounded time/output, structured result/provenance;
   mocked process and tiny-fixture tests for duration/dimensions/rational FPS/codecs/
   audio/rotation, missing binary and traversal. No FFmpeg rendering, UI or packaging.
8. **Prior FFprobe-first recommendation remains correct, with modified scope and
   rationale:** it is a metadata foundation, not justification to recreate remote
   watermark/concat capabilities. Follow with a separate narrow existing-V2V/
   combiner adapter task only where canonical routing is actually required.

A future minimal finishing vocabulary is: probe, select range/time mapping,
geometry transform, ordered assembly with explicit timebase, optional audio events/
mix, optional overlays/text/cues, encode/export and existing project registration.
Introduce only needed primitives; remote bounded alternatives can satisfy selected
nodes without replacing this graph with a fixed film-production template.

## Outstanding verification and QA

- Protected agent-skill metadata inaccessible; no paid action attempted to bypass it.
- No acceptance renders: exact timing, audio retention, output codecs, repeatability,
  quality, limits and latency remain unverified where noted.
- UI/OpenAPI disagreements, sparse output schemas and request-specific prices need
  future contract tests, not optimistic assumptions or silent schema normalization.
- Documentation-only change; no runtime/schema/IPC/UI/dependency/package changes.
  No broad application tests required. Verify docs scope, `git diff --check`, clean
  submodules and exclusion of the pre-existing `NEXT_HISTORY_TASK.md` planning file.

## Detailed live model inventory

Each link is the exact schema/detail evidence source (S3); all amounts are USD base
catalog values, not quotes. `—` means not supplied/recognized, not unsupported by
all upstream code. `bridge` is a static existing `findRemote` binding check;
`studio` is the existing catalog/service path, not a claim all parameters have been
end-to-end verified. Supplemental controls retain provider field names. Omitted
bounds are UNVERIFIED. No media was processed to populate this inventory.

Inventory counts: 35 CONTROLLED_AI, 5 DETERMINISTIC_UTILITY, 11 GENERATIVE_AI, 1 UNKNOWN. These classifications apply to the 52 detailed entries, not the entire 788-model catalog.

| Exact model ID / schema | Classification | Category; family | Base USD | Inputs (* required) | Output fields | Explicit UI controls/limits | bridge; studio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [add-image-watermark](https://api.muapi.ai/api/v1/models/add-image-watermark) | DETERMINISTIC_UTILITY | Image to Image; watermark | 0.0 | `image_url *`, `watermark_image_url *`, `position`, `opacity`, `scale` | image | No additional explicit limits in inspected UI fields | i2i/generateI2I; I2I/generateI2I |
| [add-video-watermark](https://api.muapi.ai/api/v1/models/add-video-watermark) | DETERMINISTIC_UTILITY | Video to Video; watermark | 0.0 | `video_url *`, `watermark_image_url *`, `position`, `opacity`, `scale` | video | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [ai-background-remover](https://api.muapi.ai/api/v1/models/ai-background-remover) | CONTROLLED_AI | Image to Image; tools | 0.01 | `image_url *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | i2i/generateI2I; I2I/generateI2I |
| [ai-captions](https://api.muapi.ai/api/v1/models/ai-captions) | CONTROLLED_AI | Video to Video; tools | 0.2 | `video_url *`, `language`, `theme` | video | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [ai-clipping](https://api.muapi.ai/api/v1/models/ai-clipping) | CONTROLLED_AI | Video to Video; video | 0.5 | `video_url *`, `num_highlights`, `aspect_ratio`, `return_coordinates_only` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | num_highlights={"default":3,"minValue":1,"maxValue":60}; aspect_ratio={"enum":["9:16","16:9","1:1","4:5","4:3","3:4"],"default":"9:16"} | —; special service |
| [ai-image-extension](https://api.muapi.ai/api/v1/models/ai-image-extension) | GENERATIVE_AI | Image to Image; tools | 0.03 | `image_url *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | i2i/generateI2I; I2I/generateI2I |
| [ai-image-upscaler](https://api.muapi.ai/api/v1/models/ai-image-upscaler) | CONTROLLED_AI | Image to Image; tools | 0.02 | `image_url *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | i2i/generateI2I; I2I/generateI2I |
| [ai-object-eraser](https://api.muapi.ai/api/v1/models/ai-object-eraser) | CONTROLLED_AI | Image to Image; tools | 0.05 | `image_url *`, `mask_image_url *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | i2i/generateI2I; I2I/generateI2I |
| [ai-video-upscaler](https://api.muapi.ai/api/v1/models/ai-video-upscaler) | CONTROLLED_AI | Video to Video; tools | 0.03 | `video_url *`, `resolution`, `copy_audio` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | resolution={"enum":["720p","1080p","2k","4k"],"default":"720p"}; copy_audio={"default":true} | —; V2V/processV2V |
| [ai-video-upscaler-pro](https://api.muapi.ai/api/v1/models/ai-video-upscaler-pro) | CONTROLLED_AI | Video to Video; tools | 0.24 | `video_url *`, `resolution` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | resolution={"enum":["720p","1080p","2k","4k"],"default":"720p"} | —; V2V/processV2V |
| [autocrop](https://api.muapi.ai/api/v1/models/autocrop) | CONTROLLED_AI | Video to Video; video | 0.05 | `video_url *`, `start_time *`, `end_time *`, `aspect_ratio` | video | aspect_ratio={"enum":["9:16","16:9","1:1","4:5","4:3","3:4"],"default":"9:16"} | —; — |
| [bytedance-seedream-5.0-pro-layer](https://api.muapi.ai/api/v1/models/bytedance-seedream-5.0-pro-layer) | CONTROLLED_AI | Image to Image; seedream-5 | 0.045 | `prompt *`, `image_url *`, `resolution`, `output_format` | images | resolution={"enum":["auto","1K","1.5K","2K"],"default":"auto"}; output_format={"enum":["png","jpeg"],"default":"png"} | i2i/generateI2I; I2I/generateI2I |
| [depth-anything](https://api.muapi.ai/api/v1/models/depth-anything) | CONTROLLED_AI | Video to Video; video | 0.2 | `video_url`, `image_url` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [flux-3-video-upscaler](https://api.muapi.ai/api/v1/models/flux-3-video-upscaler) | CONTROLLED_AI | Video to Video; flux-3 | 1.43 | `video_url *`, `prompt`, `upscale_factor`, `creativity` | video | upscale_factor={"default":2,"minValue":1,"maxValue":4} | —; V2V/processV2V |
| [gemini-audio-vision](https://api.muapi.ai/api/v1/models/gemini-audio-vision) | CONTROLLED_AI | Text to Text; audio-understanding | 0.004 | `model`, `prompt *`, `audio_url *`, `system_prompt` | text | No additional explicit limits in inspected UI fields | —; — |
| [heygen-video-translate](https://api.muapi.ai/api/v1/models/heygen-video-translate) | CONTROLLED_AI | Video to Video; tools | 0.25 | `video_url *`, `language` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [luma-flash-reframe](https://api.muapi.ai/api/v1/models/luma-flash-reframe) | CONTROLLED_AI | Video to Video; luma | 0.35 | `prompt`, `video_url *`, `aspect_ratio *`, `image_url`, `duration` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | aspect_ratio={"enum":["16:9","9:16","1:1","4:3","3:4","21:9","9:21"],"default":"1:1"}; duration={"enum":[5,8,10],"default":5} | —; V2V/processV2V |
| [mmaudio-v2-video-to-video](https://api.muapi.ai/api/v1/models/mmaudio-v2-video-to-video) | GENERATIVE_AI | Video to Video; mmaudio | 0.01 | `prompt *`, `video_url *`, `duration` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | duration={"default":8,"minValue":1,"maxValue":30} | —; V2V/processV2V |
| [molmo2-video-captioner](https://api.muapi.ai/api/v1/models/molmo2-video-captioner) | CONTROLLED_AI | Text to Text; video-understanding | 0.006 | `video_url *`, `detail_level` | text | No additional explicit limits in inspected UI fields | —; — |
| [motion-graphics](https://api.muapi.ai/api/v1/models/motion-graphics) | GENERATIVE_AI | Text to Video; motion-graphics | 0.63 | `prompt *`, `category`, `images_list`, `video_files`, `aspect_ratio`, `duration_seconds` | video | aspect_ratio={"enum":["16:9","9:16","1:1"],"default":"16:9"}; duration_seconds={"default":6,"minValue":5,"maxValue":30} | —; special service |
| [motion-graphics-edit](https://api.muapi.ai/api/v1/models/motion-graphics-edit) | GENERATIVE_AI | Video to Video; motion-graphics | 0.63 | `request_id *`, `edit_prompt *`, `duration_seconds`, `aspect_ratio` | video | duration_seconds={"default":6,"minValue":5,"maxValue":30}; aspect_ratio={"enum":["16:9","9:16","1:1"],"default":"16:9"} | —; special service |
| [ocr-recognize-text](https://api.muapi.ai/api/v1/models/ocr-recognize-text) | CONTROLLED_AI | other; ocr | 0.02 | `image_url *` | items | No additional explicit limits in inspected UI fields | —; — |
| [openai-whisper](https://api.muapi.ai/api/v1/models/openai-whisper) | CONTROLLED_AI | other; whisper | 0.012 | `audio_url *`, `language`, `prompt`, `response_format`, `temperature` | text | response_format={"enum":["json","text","srt","verbose_json","vtt"],"default":"json"} | —; — |
| [pixverse-v6-extend](https://api.muapi.ai/api/v1/models/pixverse-v6-extend) | GENERATIVE_AI | Video to Video; pixverse-v6 | 0.295 | `prompt *`, `video_url *`, `resolution`, `duration`, `generate_audio_switch`, `style`, `negative_prompt` | video | resolution={"enum":["360p","540p","720p","1080p"],"default":"720p"}; duration={"default":5,"minValue":1,"maxValue":15} | —; V2V/processV2V |
| [remix-video](https://api.muapi.ai/api/v1/models/remix-video) | UNKNOWN | Video to Video; tools | 0.025 | `video_url *`, `aspect_ratio` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | aspect_ratio={"enum":["1:1","16:9","9:16"],"default":"9:16"} | —; V2V/processV2V |
| [runway-act-two-v2v](https://api.muapi.ai/api/v1/models/runway-act-two-v2v) | CONTROLLED_AI | Video to Video; runway | 0.3 | `video_url *`, `reference_video_url *`, `aspect_ratio` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | aspect_ratio={"enum":["16:9","9:16","1:1","4:3","3:4","21:9"],"default":"16:9"} | —; V2V/processV2V |
| [runway-aleph-v2v](https://api.muapi.ai/api/v1/models/runway-aleph-v2v) | CONTROLLED_AI | Video to Video; runway | 0.2 | `prompt *`, `video_url *`, `aspect_ratio` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | aspect_ratio={"enum":["16:9","9:16","1:1","4:3","3:4","21:9"],"default":"16:9"} | —; V2V/processV2V |
| [seedance-2-video-watermark-remover-pro](https://api.muapi.ai/api/v1/models/seedance-2-video-watermark-remover-pro) | CONTROLLED_AI | Video to Video; sd-v2.0 | 0.065 | `video_url *` | id, status, outputs | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [seedance-2-watermark-remover](https://api.muapi.ai/api/v1/models/seedance-2-watermark-remover) | CONTROLLED_AI | Video to Video; sd-v2.0 | 0.025 | `video_url *` | video | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [seedance-2.5-video-edit](https://api.muapi.ai/api/v1/models/seedance-2.5-video-edit) | CONTROLLED_AI | Video to Video; seedance-2.5 | 1.7 | `prompt *`, `video_url *`, `images_list`, `audios_list`, `resolution`, `duration`, `generate_audio`, `seed`, `high_bitrate` | video | audios_list={"maxItems":10}; resolution={"enum":["480p","720p","1080p","4k"],"default":"720p"}; duration={"default":5,"minValue":4,"maxValue":30} | —; V2V/processV2V |
| [seedance-2.5-video-extend](https://api.muapi.ai/api/v1/models/seedance-2.5-video-extend) | GENERATIVE_AI | Video to Video; seedance-2.5 | 1.7 | `prompt *`, `video_url *`, `last_image`, `resolution`, `duration`, `generate_audio`, `seed`, `high_bitrate` | video | resolution={"enum":["480p","720p","1080p","4k"],"default":"720p"}; duration={"default":5,"minValue":4,"maxValue":30} | —; V2V/processV2V |
| [seedream-5.0-flash-layerize](https://api.muapi.ai/api/v1/models/seedream-5.0-flash-layerize) | CONTROLLED_AI | Image to Image; seedream-5 | 0.459 | `prompt`, `image_url *`, `resolution`, `output_format` | images | resolution={"enum":["auto","1K","1.5K","2K"],"default":"auto"}; output_format={"enum":["png","jpeg"],"default":"jpeg"} | i2i/generateI2I; I2I/generateI2I |
| [seedvr2-image-upscale](https://api.muapi.ai/api/v1/models/seedvr2-image-upscale) | CONTROLLED_AI | Image to Image; seedvr2 | 0.02 | `image_url *`, `resolution` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | resolution={"enum":["2k","4k","8k"],"default":"4k"} | i2i/generateI2I; I2I/generateI2I |
| [seo-youtube-video-subtitles](https://api.muapi.ai/api/v1/models/seo-youtube-video-subtitles) | DETERMINISTIC_UTILITY | Text to Text; seo | 0.01 | `video_id *`, `subtitles_language`, `subtitles_translate_language`, `location`, `language`, `os`, `tag`, `method`, `priority` | UNVERIFIED | No additional explicit limits in inspected UI fields | —; — |
| [suno-add-instrumental](https://api.muapi.ai/api/v1/models/suno-add-instrumental) | GENERATIVE_AI | Text to Audio; suno | 0.09 | `audio_url *`, `tags *`, `negative_tags`, `model`, `vocal_gender`, `style_weight`, `weirdness_constraint`, `audio_weight`, `title *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | audio/generateAudio; Audio/generateAudio |
| [suno-add-vocals](https://api.muapi.ai/api/v1/models/suno-add-vocals) | GENERATIVE_AI | Text to Audio; suno | 0.09 | `prompt *`, `audio_url *`, `style *`, `negative_tags`, `model`, `vocal_gender`, `style_weight`, `weirdness_constraint`, `audio_weight`, `title *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | audio/generateAudio; Audio/generateAudio |
| [suno-convert-to-wav](https://api.muapi.ai/api/v1/models/suno-convert-to-wav) | DETERMINISTIC_UTILITY | Text to Audio; suno | 0.01 | `task_id *`, `audio_id *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | audio/generateAudio; Audio/generateAudio |
| [suno-extend-music](https://api.muapi.ai/api/v1/models/suno-extend-music) | GENERATIVE_AI | Text to Audio; suno | 0.09 | `prompt *`, `audio_url *`, `style *`, `model`, `custom_mode`, `title`, `duration`, `persona_id`, `persona_model`, `continue_at`, `instrumental`, `negative_tags`, `vocal_gender`, `style_weight`, `weirdness_constraint`, `audio_weight` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | duration={"default":20,"minValue":10,"maxValue":360}; continue_at={"default":1,"minValue":1,"maxValue":60} | audio/generateAudio; Audio/generateAudio |
| [suno-generate-mashup](https://api.muapi.ai/api/v1/models/suno-generate-mashup) | GENERATIVE_AI | Text to Audio; suno | 0.09 | `audios_list *`, `prompt`, `style`, `instrumental`, `model`, `vocal_gender`, `style_weight`, `weirdness_constraint`, `audio_weight`, `title` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | audios_list={"maxItems":2} | audio/generateAudio; Audio/generateAudio |
| [suno-remix-music](https://api.muapi.ai/api/v1/models/suno-remix-music) | GENERATIVE_AI | Text to Audio; suno | 0.09 | `prompt`, `audio_url *`, `style *`, `model`, `custom_mode`, `title`, `duration`, `persona_id`, `persona_model`, `instrumental`, `negative_tags`, `vocal_gender`, `style_weight`, `weirdness_constraint`, `audio_weight` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | duration={"default":20,"minValue":10,"maxValue":360} | audio/generateAudio; Audio/generateAudio |
| [topaz-image-upscale](https://api.muapi.ai/api/v1/models/topaz-image-upscale) | CONTROLLED_AI | Image to Image; topaz | 0.075 | `image_url *`, `upscale_factor` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | upscale_factor={"enum":[1,2,4,8],"default":2} | i2i/generateI2I; I2I/generateI2I |
| [topaz-upscale-image-creative](https://api.muapi.ai/api/v1/models/topaz-upscale-image-creative) | CONTROLLED_AI | Image to Image; topaz-2-image-creative | 0.11 | `image_url *`, `model`, `upscale_factor`, `autoprompt`, `creativity`, `color_preservation`, `crop_to_fill`, `output_format` | image | upscale_factor={"default":2}; output_format={"enum":["jpeg","png"],"default":"jpeg"} | i2i/generateI2I; I2I/generateI2I |
| [topaz-upscale-image-generative](https://api.muapi.ai/api/v1/models/topaz-upscale-image-generative) | CONTROLLED_AI | Image to Image; topaz-2-image-generative | 0.11 | `image_url *`, `model`, `upscale_factor`, `crop_to_fill`, `output_format`, `subject_detection`, `face_enhancement`, `face_enhancement_strength`, `face_enhancement_creativity`, `enhancement_strength`, `creativity`, `texture`, `prompt`, `autoprompt`, `sharpen`, `denoise`, `detail` | image | upscale_factor={"default":2}; output_format={"enum":["jpeg","png"],"default":"jpeg"} | i2i/generateI2I; I2I/generateI2I |
| [topaz-upscale-image-precision](https://api.muapi.ai/api/v1/models/topaz-upscale-image-precision) | CONTROLLED_AI | Image to Image; topaz-2-image-precision | 0.11 | `image_url *`, `model`, `upscale_factor`, `output_format`, `crop_to_fill`, `subject_detection`, `face_enhancement`, `face_enhancement_creativity`, `face_enhancement_strength`, `sharpen`, `denoise`, `fix_compression`, `strength` | image | upscale_factor={"default":2}; output_format={"enum":["jpeg","png"],"default":"jpeg"} | i2i/generateI2I; I2I/generateI2I |
| [topaz-upscale-video-creative](https://api.muapi.ai/api/v1/models/topaz-upscale-video-creative) | CONTROLLED_AI | Video to Video; topaz-2-video-creative | 0.42 | `video_url *`, `prompt`, `creativity`, `realism`, `sharp`, `upscale_factor`, `target_fps`, `H264_output` | video | upscale_factor={"default":2}; target_fps={"minValue":16,"maxValue":60}; H264_output={"default":false} | —; V2V/processV2V |
| [topaz-upscale-video-generative](https://api.muapi.ai/api/v1/models/topaz-upscale-video-generative) | CONTROLLED_AI | Video to Video; topaz-2-video-generative | 0.17 | `video_url *`, `model`, `upscale_factor`, `target_fps`, `softness`, `H264_output` | video | upscale_factor={"default":2}; target_fps={"minValue":16,"maxValue":60}; H264_output={"default":false} | —; V2V/processV2V |
| [topaz-upscale-video-precision](https://api.muapi.ai/api/v1/models/topaz-upscale-video-precision) | CONTROLLED_AI | Video to Video; topaz-2-video-precision | 0.08 | `video_url *`, `model`, `upscale_factor`, `target_fps`, `compression`, `noise`, `halo`, `grain`, `recover_detail`, `H264_output` | video | upscale_factor={"default":2}; target_fps={"minValue":16,"maxValue":60}; H264_output={"default":false} | —; V2V/processV2V |
| [topaz-video-upscale](https://api.muapi.ai/api/v1/models/topaz-video-upscale) | CONTROLLED_AI | Video to Video; topaz | 0.08 | `video_url *`, `upscale_factor` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | upscale_factor={"enum":[1,2,4],"default":2} | —; V2V/processV2V |
| [video-background-remover](https://api.muapi.ai/api/v1/models/video-background-remover) | CONTROLLED_AI | Video to Video; tools | 0.01 | `video_url *`, `preserve_audio`, `background_color`, `output_container_and_codec` | video | preserve_audio={"default":true}; output_container_and_codec={"enum":["webm_vp9","mp4_h264","mp4_h265","mov_h265","mov_proresks","mkv_h264","mkv_h265","mkv_vp9","gif"],"default":"webm_vp9"} | —; V2V/processV2V |
| [video-combiner](https://api.muapi.ai/api/v1/models/video-combiner) | DETERMINISTIC_UTILITY | Video to Video; video-tools | 0.05 | `videos_list *`, `aspect_ratio` | video | videos_list={"maxItems":20}; aspect_ratio={"enum":["auto","16:9","9:16","1:1","4:3","3:4","21:9","9:21"],"default":"auto"} | —; builder utility |
| [video-watermark-remover](https://api.muapi.ai/api/v1/models/video-watermark-remover) | CONTROLLED_AI | Video to Video; tools | 0.065 | `video_url *` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | No additional explicit limits in inspected UI fields | —; V2V/processV2V |
| [wan2.2-edit-video](https://api.muapi.ai/api/v1/models/wan2.2-edit-video) | CONTROLLED_AI | Video to Video; wan2.2 | 0.3 | `prompt *`, `video_url *`, `resolution` | id, urls, error, status, outputs, timings, created_at, has_nsfw_contents | resolution={"enum":["480p","720p"],"default":"480p"} | —; V2V/processV2V |
