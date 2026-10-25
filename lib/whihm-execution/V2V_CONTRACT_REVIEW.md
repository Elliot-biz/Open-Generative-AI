# Bounded V2V contract review

Inspection: 2026-10-25, starting HEAD `e65ff8a95cf8d04a0822bbf18ab136cca3230e1e`. This is a source-contract review of the 75 checked-out OGA V2V entries, not another provider catalog or pricing audit. All classifications concern eligibility for the **new canonical route**, not whether the existing OGA UI should remove a tool.

Evidence: `packages/studio/src/models.js`, `videoToolCapabilities.js`, `modelCapabilities.js`, `modelParameters.js`, `videoWorkflows.js`, `seedanceModels.js`, shared `muapi.js`, and desktop `src/lib/muapi.js`. Reuse the completed [creative audit](CREATIVE_CAPABILITY_REUSE_AUDIT.md) and [provider audit](MUAPI_MEDIA_CAPABILITY_AUDIT.md). Public non-generating GETs refreshed only [face swap](https://api.muapi.ai/api/v1/models/ai-video-face-swap) and [base Seedance 2.5 edit](https://api.muapi.ai/api/v1/models/seedance-2.5-video-edit). No authentication, upload, estimate, submission or provider execution was used. Other provider contracts rely on the completed audit; no fresh guarantee is implied.

## Reviewed execution subset

| Model | Required inputs | Supported optional inputs/settings | Bounds / decision |
| --- | --- | --- | --- |
| `runway-aleph-v2v` | source `video_url`, prompt | aspect_ratio | Existing override enum; no image-reference contract |
| `wan2.2-edit-video` | source video, prompt | resolution | 480p/720p; fix loss of declared common control in shared mapping |
| `seedance-2.5-video-edit` | source video, prompt | images_list, audios_list, resolution, duration, generate_audio, seed, high_bitrate | Images 0–30, audio 0–10, duration integer 4–30, seed −1–4294967295; resolution 480p/720p/1080p/4k. Current provider has no aspect_ratio on this exact endpoint; corrected only this declaration and its native-resolution facet |
| `runway-act-two-v2v` | character `video_url`, performance `reference_video_url` | aspect_ratio | Two distinct videos, not Recast image + driving video. Add required-field metadata; preserve aspect |
| `ai-video-face-swap` | video_url, image_url | None currently represented in OGA | Public metadata also exposes target_gender/target_index, but these remain unbound; reject rather than silently drop |
| `video-background-remover` | video_url | None currently represented in OGA | Provider audio/background/container controls remain unbound; source-only service defaults are explicit scope |
| `ai-video-upscaler` | video_url | resolution, copy_audio | Existing enum 720p/1080p/2k/4k; boolean audio |
| `topaz-video-upscale` | video_url | upscale_factor | Existing integer enum 1/2/4 |
| `heygen-video-translate` | video_url | language | Existing language enum; omitted language visibly defaults to Hindi, matching existing override/provider default |

For these nine models, the pure shared contract derives fields/defaults/media limits from existing catalog + overrides. It validates required text/media, exact types, enums, bounds and ordered reference arrays. Only configurable fields accept the existing `options` envelope; conflicts with top-level values reject. The existing desktop single-image alias explicitly maps to one ordered array item and rejects competing forms. No raw payload or provider-field escape hatch. The shared `processV2V` remains the only submit/poll/result boundary; the desktop method now delegates to it. Existing non-reviewed Studio paths are preserved, but cannot enter the canonical V2V route.

Required/optional media in the inventory below is **source declaration**, not a newly verified provider promise. `?` means imageOptional. Every entry has its existing source-video field unless stated otherwise. Supplemental fields shown exclude media/prompt. Enum/range definitions remain in the linked existing source; the table does not duplicate them into executable metadata.

## Complete checked-out inventory

Classes describe inspection findings before the targeted fixes: `R` = READY_FOR_GENERIC_V2V_BINDING; `F` = NEEDS_TARGETED_CONTRACT_FIX (fixed in this milestone, now bound); `S` = SPECIALIZED_ROUTE_ALREADY_EXISTS; `I` = INSUFFICIENT_EVIDENCE; `D` = DEFER (source inspected, not yet reviewed sufficiently for execution).

| Exact OGA ID (endpoint when different) | Class | Media beyond source video; text | Declared supplemental fields |
| --- | --- | --- | --- |
| `video-watermark-remover` | I | — | — |
| `kling-v2.6-std-motion-control` | D | image_url (requirement per source), prompt required | character_orientation |
| `kling-v3.0-std-motion-control` | D | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `kling-v3.0-pro-motion-control` | S | image_url (requirement per source), prompt supported | character_orientation, keep_original_sound |
| `ai-video-face-swap` | R | image_url (requirement per source) | — |
| `mmaudio-v2-video-to-video` → `mmaudio-v2/video-to-video` | I | prompt supported | — |
| `runway-aleph-v2v` | R | prompt required | aspect_ratio |
| `ai-dance-effects` | I | image_url (requirement per source), prompt supported | — |
| `ai-video-upscaler` | R | — | resolution, copy_audio |
| `wan2.2-edit-video` | F | prompt required | resolution |
| `heygen-video-translate` | R | — | language |
| `topaz-video-upscale` | R | — | upscale_factor |
| `ai-video-upscaler-pro` | I | — | — |
| `remix-video` | I | — | — |
| `kling-o1-video-edit` | D | images_list (requirement per source), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-video-edit-fast` | D | images_list (requirement per source), prompt required | keep_original_sound, aspect_ratio |
| `kling-o1-standard-video-edit` | D | images_list (requirement per source), prompt required | keep_original_sound |
| `wan2.2-spicy-video-extend` | D | prompt required | resolution, duration |
| `seedance-v1.5-pro-video-extend` | D | prompt required | resolution, duration, generate_audio, camera_fixed |
| `seedance-v1.5-pro-video-extend-fast` | D | prompt required | resolution, duration, generate_audio, camera_fixed |
| `add-video-watermark` | I | watermark_image_url (requirement per source) | — |
| `seedance-2-watermark-remover` → `seedance-2.0-watermark-remover` | I | — | — |
| `ai-captions` | I | — | — |
| `ltx-2.3-video-extend` | D | prompt supported | duration |
| `seedance-2-video-watermark-remover-pro` | I | — | — |
| `pixverse-v6-extend` | D | prompt required | resolution, duration, generate_audio_switch, negative_prompt, style |
| `wan2.7-video-extend` | D | audio_url, prompt required | negative_prompt, resolution, duration |
| `wan2.7-video-edit` | D | images_list?, prompt required | negative_prompt, resolution, duration, audio_setting |
| `happy-horse-1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-1080p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `happy-horse-1.1-video-edit-720p` | D | images_list (requirement per source), prompt required | audio_setting, seed |
| `gemini-omni-video-edit` | I | image_urls (requirement per source), prompt required | — |
| `video-background-remover` | R | — | — |
| `kling-v2.6-pro-motion-control` | D | image_url (requirement per source), prompt required | character_orientation |
| `infinitetalk-video-to-video` | S | audio_url, prompt supported | resolution |
| `wan2.2-animate` | S | image_url (requirement per source), prompt supported | mode, resolution |
| `volcengine-video-to-video-lip-sync` | S | audio_url | mode, separate_vocal, open_scenedet, align_audio, align_audio_reverse, templ_start_seconds |
| `seedance-2.5-video-edit` | F | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, resolution |
| `seedance-2.5-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend-480p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend-1080p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-video-extend-4k` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-480p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-1080p` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-edit-4k` | D | images_list?, audios_list, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-480p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-480p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-1080p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-1080p` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-intl-video-extend-4k` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `seedance-2.5-spicy-video-extend-4k` | D | last_image?, prompt required | duration, generate_audio, seed, high_bitrate, aspect_ratio |
| `flux-3-video-extend` | D | prompt required | aspect_ratio, resolution, duration, generate_audio |
| `flux-3-video-upscaler` | D | prompt supported | upscale_factor, creativity |
| `flux-3-video-extend-draft` | D | prompt required | aspect_ratio, duration, generate_audio |
| `gemini-omni-flash-1-1-edit` | D | prompt required | resolution |
| `depth-anything` | I | image_url? | — |
| `runway-act-two-v2v` | F | reference_video_url required | aspect_ratio |
| `luma-flash-reframe` | D | image_url?, prompt supported | aspect_ratio, duration |
| `seedance-2-video-edit` → `seedance-v2.0-video-edit` | D | source video_urls, images_list?, prompt required | audio_files, aspect_ratio, quality, duration |
| `happy-horse-1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `happy-horse-1.1-video-edit` | D | images_list?, prompt required | resolution, audio_setting, seed |
| `topaz-upscale-video-creative` | D | prompt supported | creativity, realism, sharp, upscale_factor, target_fps, H264_output |
| `topaz-upscale-video-generative` | D | — | model, upscale_factor, target_fps, softness, H264_output |
| `topaz-upscale-video-precision` | D | — | model, upscale_factor, target_fps, compression, noise, halo, grain, recover_detail, H264_output |

Counts: D=51, F=3, I=11, R=6, S=4; 75 total, nine now bound.

## Deferred/specialized findings

- Kling v3 Pro Motion Control and Wan Animate have the richer existing `recast` aliases; Infinitetalk/Volcengine have `lipsync`. Explicit V2V routing rejects these; it does not silently reroute. Other Kling variants are deferred, not assumed covered by a different alias.
- Seedance extension/resolution/profile variants, Kling O1 edits, Wan 2.7, Happy Horse, Gemini, Flux, Luma and creative Topaz paths remain callable through their existing OGA paths. Their canonical admission requires a separate bounded contract review. No wildcard family permission.
- `seedance-2-video-edit` uses an array source `video_urls`, with additional audio/quality contracts; do not flatten it into one video. Defer.
- Topaz generative/precision inputs contain a provider option named `model`, colliding with the existing logical model selector. Defer pending a narrow explicit representation; no raw-field workaround.
- Depth Anything can have alternative image/video roles. Source-only validation would fabricate a mandatory video contract; defer.
- Sparse catalog entries do not prove absent provider functionality. Watermarks/captions/pro upscaler/remix/MMAudio/dance/Gemini need contract evidence before canonical admission.
- Existing desktop V2V forwarded only source video, image and prompt. Delegation now preserves shared options and lifecycle, without changing desktop Video Studio controls. Missing UI controls are not invented.

## Precision and remaining limitations

These are AI transformations, not deterministic finishing guarantees. Validation checks declared request fields, not actual media duration, dimensions, size, codec or contents. Face swap metadata specifies <10 MB, <1280×720 or 720×1280, ≤600 frames; source URLs cannot prove those here. Seedance metadata says source videos >30s are provider-trimmed; no local probe is introduced. No promise of exact timing, camera, background or pixel preservation.

Readiness reuses static binding evidence; detailed supplied-input validation is the existing single-node plan responsibility. Planning has no credentials/upload/submission/polling. Host authorization/project integrity and existing upload boundaries remain unchanged. Runtime success is unverified without paid execution, which was intentionally not attempted.

Next: project Astra-facing capability information from these reviewed contracts and existing Recast/Motion/Lip Sync contracts; keep unreviewed models unavailable. Do not build a second catalog or broaden executor coverage implicitly.
