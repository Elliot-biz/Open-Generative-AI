# WHIHM creative capability and external reuse audit

Inspected **2026-10-25**, local baseline
`dcccff1b877201d848a635676c494cab6689397b`. Research/documentation only.
Open Generative AI (OGA), `Anil-matcha/Open-Generative-AI`, remains the application
foundation. No alternative application, provider stack or workflow-state engine is
recommended as a replacement.

## 1. Executive summary

**PARTIAL:** source and public metadata establish reusable creative capabilities,
but output fidelity, exact preservation, latency and backend compatibility remain
unverified without authorized generation. All five requested external repositories
were accessible. No paid testing is needed to identify the main integration gaps.

The highest-value missing WHIHM bindings are **character/performance recast,
Seedance motion/object transfer, and general V2V editing**. These already exist in
OGA; they should not become new WHIHM model clients or editors. The pure bridge's
current route list covers t2i/i2i/t2v/i2v/audio/lipsync, not recast/motion/V2V.
A nominal model lookup is not proof that required media reach the service.

Body Swap is a video-driven character-animation/recast interface with **three
backends**, not a face-only swap or a deterministic replacement compositor.
The adjacent upstream Motion Control Studio is a separate, broader multi-reference
motion/object-swap interface. Treating both as absent would lead to unnecessary
implementation. Two existing Body Swap contract gaps need targeted correction
before dependable canonical binding: Act Two's driving-video field and Wan's
unexposed animate/replace mode.

The external Genjustsu project adds inspectable depth/mask/face-guided preparation
and source-audio restoration patterns. It does **not** supply an offline Genjutsu
model, a ComfyUI package, or a reason to replace OGA. Its default AI steps call
Replicate/Enhancor, and its scripts recommend WSL on Windows. Selective patterns,
not wholesale integration, are justified.

**Roadmap change:** prioritize a small recast contract-and-binding milestone over
FFprobe-first for creative leverage. FFprobe remains necessary for exact media
inspection, but is not a prerequisite to exposing existing creative runtimes.
No mandatory reference, music, logo, video, scene count or pipeline is introduced.

## 2. Established evidence and source ledger

Read and reuse the completed [local audit](DETERMINISTIC_MEDIA_AUDIT.md) (**L**) and
[live MuAPI audit](MUAPI_MEDIA_CAPABILITY_AUDIT.md) (**M**). Their finishing, probing,
watermark, catalog, pricing and discovery work is not repeated here. In particular,
M's 788-model discovery and 52 schema records are established evidence, not newly
claimed coverage. Only five directly relevant recast/motion schemas were refreshed.

Labels throughout:

- **CONFIRMED:** code, schema or documented behavior exists; not rendered quality.
- **INFERRED:** architectural recommendation or likely use, explicitly conditional.
- **UNVERIFIED:** unavailable evidence, conflicting fields, preservation/quality,
  service acceptance, performance or platform behavior not tested.

| Evidence | Exact location / scope |
| --- | --- |
| O1: web navigation and mounts | `components/StandaloneShell.js`: `TABS` entries and mounts around 980–1050; `app/studio/[[...slug]]/page.js`. Confirms public-source routes, not private hosted deployment parity. |
| O2: desktop navigation | `index.html` → `src/main.js:navigate`; `src/components/Header.js:items`. Current entrypoint, not the unused older `Sidebar.js` menu. |
| O3: model/input declarations | `packages/studio/src/models.js`: `recastModels`, `motionControlModels`, t2i/i2i/t2v/i2v/v2v/audio catalogs; `imageInputContracts.js`; `modelCapabilities.js`; `videoWorkflows.js`; `videoMediaInputs.js`. |
| O4: existing service boundaries | `packages/studio/src/muapi.js`: `processRecast`, `processMotionControl`, `processV2V`, `generateI2V`, `generateMarketingStudioAd`, `processLipSync`, `runClipping`, `runMotionGraphics`; `src/lib/muapi.js:processV2V` for the more limited desktop client. |
| O5: Body Swap | `packages/studio/src/components/RecastStudio.jsx`: model default, uploads, `handleGenerate`, orientation, asset/history state. |
| O6: adjacent creative studios | `MotionControlStudio.jsx`, `VideoStudio.jsx`, `MarketingStudio.jsx`, `VibeMotionStudio.jsx`, `CinemaStudio.jsx`, `LayersStudio.jsx`, `AiInfluencerStudio.jsx`, `DesignAgentStudio.jsx`, `AgentStudio.jsx`, `AppsStudio.jsx` under `packages/studio/src/components/`. |
| W: current canonical bindings | `lib/whihm-execution/runtime.mjs:routes/findRemote/resolveExecutionBinding`, `bridge.mjs:checkInputs`; existing fixed host and project/production APIs. |
| P: targeted live schema GETs | `https://api.muapi.ai/api/v1/models/{id}` for `kling-v3.0-pro-motion-control`, `runway-act-two-i2v`, `wan2.2-animate`, `seedance-2.5-motion-control`, `seedance-2-motion-control`. Public, unauthenticated, enabled records; no estimates or submissions. |
| H: official functional target | [Higgsfield Genjutsu](https://higgsfield.ai/genjutsu), [official overview](https://higgsfield.ai/blog/higgsfield-genjutsu). Product descriptions, not independently verified fidelity or evidence of shared backend. |
| X: external sources | GitHub repository metadata, immutable default-branch commits, trees, selected source/config/tests, README and available licenses, listed below. Source fetched to temporary research storage only; no checkout/setup/inference. |

Static, network-free `findRemote` lookups and media-mapping inspection were used
to distinguish route presence from payload completeness. No provider methods were
invoked. Existing Node typeless-module warnings appeared during static imports;
no configuration change was made. No credentials were read for this audit.

## 3. Reconcile the actual Studios

All rows are CONFIRMED source exposure. **Web** means the checked-out Next shell;
**desktop** means the current Electron/Vite source navigation. A UI's existence
is not a promise of successful live jobs. File names are under O6 unless qualified.

| Studio/tool | Creative function and relevance | Web / current desktop | Reuse decision |
| --- | --- | --- | --- |
| Image | T2I, I2I, references, image editing, specialist image tools | Yes / yes (`src/components/ImageStudio.js`) | Strategically important; reuse model/input/service contracts. |
| Video | T2V, I2V, V2V; grouped animate/keyframes/references/edit/extend/motion workflows (`videoWorkflows.js`) | Yes / yes (`src/components/VideoStudio.js`) | Strategically important. Desktop V2V exists but forwards fewer controls than shared web service. |
| Audio Studio | Music, speech, effects, Suno variants | Yes / no dedicated desktop mount | Strategically important audio source; underlying audio bridge exists. |
| AI Clipping | Semantic highlight selection, aspect choices | Yes / no dedicated mount | Wrapper around M's controlled-AI clipping; T2 specialist. |
| Motion Control | Seedance motion_transfer / objects_swap, video + multiple images | Yes / no dedicated mount | T1 creative strategy; reuse `processMotionControl`. Kling motion variants also appear in desktop generic V2V. |
| Vibe Motion | Prompt motion graphics and instruction-based revision of prior request | Yes / no dedicated mount | Existing higher-level creative composition, not deterministic finishing. T2. |
| Lip Sync | Audio-driven video/image performance synchronization | Yes / yes | T1; existing `processLipSync` bridge. Keep distinction from original-performance transfer. |
| Body Swap | Single character image + source performance video; three recast aliases | Yes / no dedicated mount | T1. Related underlying models selectable in desktop Video; that does not mean Body Swap Studio is mounted. |
| Cinema Studio | Camera/lens/aperture/style-driven image prompting; still generation | Yes / yes | Valuable reusable recipe/prompt surface, not physical camera-control guarantees or timeline assembly. T2. |
| Marketing Studio | Brand/product reference-driven video-ad composition | Yes / no dedicated mount | T1 commercial recipe; `generateMarketingStudioAd` chooses Seedance Omni reference endpoint by resolution. |
| Layers | AI decomposition plus browser grading/download | Yes / no dedicated mount | T2 specialist layer/control preparation; existing decomposition service, not a replacement editor. |
| AI Influencer | Attribute-driven image prompting using `nano-banana-pro` | Yes / no dedicated mount | Recipe wrapper around existing generation; does not itself train or guarantee persistent identity. T3. |
| Workflows | Existing React Flow builder, template/published workflows, remote node execution | Yes / yes (desktop wrapper) | Strategically important reusable orchestration UI; not canonical WHIHM source of truth. |
| Agents | Templates/user/featured agents, conversations and creation | Yes / yes (desktop wrapper) | High-level planning/interaction surface; keep separate from deterministic Astra control. |
| Design Agent | `DesignAgentStudio.jsx` → `CreativeCanvas` from `design-agent` submodule | Yes / no dedicated mount | Existing interactive creative agent, remote services. Reuse as optional surface; no rebuild. Existing token/browser storage assumptions need review before desktop reuse. |
| Apps | `AppsStudio.jsx`: linked app templates + interest registration cards | Yes / no dedicated mount | Discovery/marketing directory; not proof each advertised app is an executable capability. T4 for Astra runtime. |
| MCP & CLI | Links/setup for provider model/agent tools | No mount found in O1 / yes | Agent-control/discovery surface, not another creative engine. CLI details below. |
| Local Models / Settings | sd.cpp/Wan2GP configuration and downloads | Desktop settings; local Image/Video modes | Runtime availability/input constraints matter to Astra; settings are not creative operations. Reuse existing local path. |
| Upload/history/gallery/library | Existing per-Studio assets/results and pickers | Varies / existing upload pickers/history | Reuse interaction patterns. Browser storage is not portable project evidence. No separate new DAM inferred. |

Desktop generic V2V forwards source video, optional image and optional prompt only
in `src/lib/muapi.js`; the web `processV2V` also handles supplemental/schema controls.
Thus "desktop exposed" must not be read as complete parameter parity. No desktop
UI integration is recommended merely to give Astra nonvisual access.

The desktop Image component/client also differs from the shared web implementation:
`src/lib/muapi.js:generateI2I` forwards primary imagery and basic prompt/settings,
without the shared auxiliary-image/scene-description contract. A listed face-swap,
try-on or product-shot model therefore does not establish complete desktop controls.
The WHIHM bridge uses the shared Studio service/input contracts instead; preserve
that boundary and avoid copying the older desktop client's limitations into it.

Relevant existing sub-routes: `/studio/[[...slug]]` (also the Chinese locale shell),
`/workflow/[id]` and `/workflow/[id]/[tab]` mount the same web shell; Agents additionally
has `/agents/[agent_id]`, `/agents/[agent_id]/[conversation_id]`, `/agents/create`
and `/agents/edit/[id]`. Those separate agent pages use Next server/cookie/service
boundaries; their existence does not mean desktop inline list/chat/create includes
profile/edit pages. Desktop uses the already committed workflow/agent route adapters.

## 4. Creative taxonomy, inputs and reuse matrix

Input tokens: **TEXT_ONLY / NO_REFERENCE** require no media reference; **ONE_IMAGE**,
**MULTI_IMAGE**, **SOURCE_VIDEO**, **REFERENCE_VIDEO**, **AUDIO**, **MASK**,
**POSE/MOTION**, **OTHER** identify the actual role. Source video can be generated
upstream, imported project media or external reference; assets are not universally
required. Models accept different subsets; do not manufacture missing references.

`EXISTS_AND_BOUND` below means a static WHIHM route exists, not paid acceptance.
`EXISTS_NOT_BOUND` means OGA/service/catalog exists without the necessary bridge
route. `EXISTS_UI_ONLY` denotes a recipe/surface with no standalone canonical
operation; it may call bound primitives. `EXISTS_EXTERNAL` denotes an optional
external component. `GENUINELY_MISSING` is limited to the established inspection
scope. Builder column evidence is expanded in section 11.

| Creative capability / tier | Required → optional inputs | Current OGA / MuAPI evidence | External advantage | WHIHM access | Best strategy |
| --- | --- | --- | --- | --- | --- |
| T2I / T1 | TEXT_ONLY, NO_REFERENCE → style text/settings | Image; multiple model families | No replacement needed | EXISTS_AND_BOUND (`t2i`, selected model) | REUSE_OGA_AS_IS |
| I2I / identity/character/product/style reference / T1 | ONE_IMAGE or MULTI_IMAGE → prompt, mask according to model | Image, Flux PuLID/Redux, Nano/Seedream/Kontext reference edits; O3 contracts | Role/cardinality patterns, not better identity guarantee | EXISTS_AND_BOUND (`i2i`, mode may need disambiguation) | SUPPORT_MULTIPLE_EXECUTORS |
| T2V / T1 | TEXT_ONLY, NO_REFERENCE → optional reference roles for selected variant | Video; existing text generation | No new engine | EXISTS_AND_BOUND (`t2v`) | REUSE_OGA_AS_IS |
| I2V / T1 | ONE_IMAGE → motion prompt, optional end frame | Video animate_image | External role mapping only | EXISTS_AND_BOUND (`i2v`) | REUSE_OGA_AS_IS |
| First/last-frame control / T1 | MULTI_IMAGE (start + end) → prompt | Video keyframes and model last-image fields | wide-trace roles make ordering explicit | EXISTS_AND_BOUND for compatible I2V variants; validate fields per model | REUSE_OGA_AS_IS |
| Reference video / multireference generation / T1 | Model-specific SOURCE_VIDEO/REFERENCE_VIDEO and/or MULTI_IMAGE/AUDIO; some variants text-only | Video references; Marketing Seedance Omni | Explicit role/cardinality pattern | Bound for recognized T2V/I2V catalog variant; dedicated Marketing wrapper unbound | SUPPORT_MULTIPLE_EXECUTORS |
| Body/character recast / T1 | SOURCE_VIDEO + ONE_IMAGE → prompt/orientation by backend | Body Swap; Kling/Act Two/Wan | Inspectable masks/depth/mesh recipe | EXISTS_NOT_BOUND for recast aliases; nominal Act Two I2V has payload gap | EXTEND_OGA |
| Motion/body/pose transfer / T1 | REFERENCE_VIDEO + ONE_IMAGE/MULTI_IMAGE → prompt, duration | Body Swap, Motion Control; Seedance/Kling/Wan | Explicit face mesh, depth/masks; no generic body-pose graph | EXISTS_NOT_BOUND for motion-control service | SUPPORT_MULTIPLE_EXECUTORS |
| Expression/reenactment/performance / T1 | REFERENCE_VIDEO + ONE_IMAGE or SOURCE_VIDEO → optional prompt | Act Two I2V/V2V, Wan Animate, Kling | Optional face-landmark overlay | Nominal Act Two I2V route incomplete; V2V unbound | SUPPORT_MULTIPLE_EXECUTORS |
| Face replacement / T2 | ONE_IMAGE target + ONE_IMAGE face; or SOURCE_VIDEO + ONE_IMAGE | `ai-image-face-swap` / `ai-video-face-swap` | No proven better face engine | Image EXISTS_AND_BOUND incl. swap input contract; video EXISTS_NOT_BOUND | REUSE_OGA_AS_IS |
| Object/product replacement / T1 | SOURCE_VIDEO + MULTI_IMAGE and/or prompt; still edit may use ONE_IMAGE + MASK | Motion Control objects_swap, V2V editors; image editing | SAM-selected subject/depth guide | Still editing bound; Motion/V2V EXISTS_NOT_BOUND | SUPPORT_MULTIPLE_EXECUTORS |
| Wardrobe / virtual try-on / T1 commercial | Model/person ONE_IMAGE + garment ONE_IMAGE; video + appearance references for video edits | `ai-dress-change`; Motion Control prompt mode; V2V edit | Mask-guided region isolation possible, untested for clothing | Still EXISTS_AND_BOUND; video EXISTS_NOT_BOUND | REUSE_OGA_AS_IS |
| Background/location/scene replacement / T1 | Existing image/video + prompt; optional image/mask | I2I, V2V Aleph/Seedance/Wan, Motion Control instructions | Depth foreground over retained background; not a general location-rebuild engine | Image bound; video EXISTS_NOT_BOUND | SUPPORT_MULTIPLE_EXECUTORS |
| Restyle / relight / existing-video edit / T1 | SOURCE_VIDEO + prompt → image/audio references by model | Video processV2V; Aleph, Seedance, Wan and other catalog families (M) | No demonstrated superior external editor | EXISTS_NOT_BOUND for shared V2V | EXTEND_OGA |
| Camera control / preservation / T1 when source choreography matters | Prompt for new shots; REFERENCE_VIDEO for inherited camera; image options | Cinema prompt vocabulary, motion control, video model controls | Reference roles; no camera-solve primitive found | Generation bound; motion service unbound; exact trajectory UNVERIFIED | SUPPORT_MULTIPLE_EXECUTORS |
| Explicit full-body pose extraction/trajectory editing / T2 | SOURCE_VIDEO or POSE/MOTION → structured controls | Implicit video-driven pose transfer exists; standalone generic editable skeleton path not established | Repo only face mesh, not full-body pose extractor | GENUINELY_MISSING generic control in inspected scope | DEFER |
| Extend / T2 | SOURCE_VIDEO or OTHER prior request ID → prompt, last frame | Existing extend_video variants (M) | No replacement needed | Depends on variant: T2V/I2V route vs V2V unbound | EXTEND_OGA |
| Reframe / AI crop / T2 | SOURCE_VIDEO → aspect, prompt or start/end | Luma/Autocrop (M); controlled AI | No new engine | V2V route missing; Autocrop only catalog in inspected sources | WRAP_MUAPI |
| Upscale / refine / interpolate / T2 | ONE_IMAGE or SOURCE_VIDEO → scale/FPS/creative controls | Topaz/SeedVR/upscale families (M) | Not a demonstrated better refiner | Image bound; video unbound; no exact retime guarantee | REUSE_OGA_AS_IS |
| Remove background / object / T2 | Image/video → MASK for explicit erasure | Existing image input contracts + video segmentation/removal (M) | Raw temporal SAM masks more inspectable than opaque cutout output | Image bound; video unbound; raw SAM external | SUPPORT_MULTIPLE_EXECUTORS |
| Layerize/decompose / T2 | ONE_IMAGE → prompt | Layers `decomposeLayers`, Seedream variants (M) | No need new layer editor | Some model IDs bound I2I; dedicated wrapper not separately bound | REUSE_OGA_AS_IS |
| Audio/music/speech/effects / T2 | TEXT_ONLY → AUDIO for remix/extend/mashup; video-conditioned sound uses SOURCE_VIDEO | Audio Studio/Suno/ElevenLabs/MMAudio (M) | Demucs separation is distinct additional capability | Audio catalog bound; MMAudio V2V unbound | REUSE_OGA_AS_IS |
| Lip sync / dubbing / T1 | AUDIO + ONE_IMAGE or SOURCE_VIDEO; translation uses video + target language | Lip Sync bound; Heygen translation V2V (M) | External original-audio restoration is different from dubbing | Lip Sync EXISTS_AND_BOUND; translation EXISTS_NOT_BOUND | SUPPORT_MULTIPLE_EXECUTORS |
| Product shot / placement / UGC / showcase / T1 | Product ONE_IMAGE + scene text for shot; ads optional/reference media as recipe requires | `ai-product-shot`, Marketing, templates (M) | Media roles; no external guaranteed brand fidelity | Shot bound; marketing recipe UI-only; primitives partly bound | REUSE_OGA_AS_IS |
| Video/audio/content analysis / T2 | SOURCE_VIDEO / AUDIO / image + question | Molmo, Gemini Audio Vision, vision LLM/Design Agent (M) | No measured superiority | Catalog/service-dependent; no general analysis bridge route | WRAP_MUAPI |
| Transcription / OCR / depth / T2 | AUDIO / ONE_IMAGE / SOURCE_VIDEO | Whisper/OCR/depth (M) | Explicit masks, depth alignment + repair diagnostics | Mostly EXISTS_NOT_BOUND; do not call speech recognition deterministic | WRAP_MUAPI |
| Clipping / captions / T2 | SOURCE_VIDEO → style/language/highlights | Clipping/V2V captions (M) | No need new clients | EXISTS_NOT_BOUND | EXTEND_OGA |
| Watermark / combine / conversion / T3 | Source + optional logo; ordered video list; Suno task/audio IDs | Prior detailed M findings | Not re-audited | Image/Suno bound; video/combiner unbound | REUSE_OGA_AS_IS |
| Exact deterministic finishing / T2 infrastructure | Only media/timing needed for requested operation | L/M gaps established | PyAV restoration pattern, not complete portable engine | GENUINELY_MISSING generic executor | BUILD_WHIHM |
| Specialist agents / templates / reusable workflows / T2 | TEXT_ONLY → zero/many assets per recipe | Agents, Design Agent, Workflows; remote runtime exists | CLI JSON/dry-run/schema affordances | Existing UI/runtime; not a deterministic canonical planner binding | REUSE_OGA_AS_IS |
| Apps directory / duplicated editors / T4 | N/A | Existing links/interest cards and working upstream UI | No app replacement justified | EXISTS_UI_ONLY | NOT_NEEDED |

POSE/MOTION guidance from a driving video is not the same as exposed pose-keypoint
editing. Reference identity/style fidelity, exact camera paths, exact timing and
pixel-preserving product geometry are UNVERIFIED unless explicitly tested; a schema
or preset is not a guarantee. Fixed image overlays remain optional conventional
operations, not substitutes for realistic product placement inside a moving scene.

## 5. Body Swap deep dive

### Actual implementation and inputs

CONFIRMED flow: O1 `body-swap` → O5 `RecastStudio.jsx` → O3 `recastModels` →
O4 `processRecast` → existing `submitAndPoll` / upload / results. The default is
`kling-v3.0-pro-recast`. Studio requires **one source video and one target character
image**, offers per-model optional prompt/aspect/orientation, and rejects uploaded
videos over 50 MiB. Media picker/history uses browser storage, not WHIHM project
storage. No separate skeleton extraction, region mask, scene reference library,
local inference or deterministic swap compositor occurs inside this Studio.

| Studio alias → actual MuAPI endpoint | Advertised intent and live requirements (P) | Cost/input limits | Current limitations |
| --- | --- | --- | --- |
| `kling-v3.0-pro-recast` → `kling-v3.0-pro-motion-control` | Character image + performance video; optional motion prompt; character orientation; source sound option | Base $0.16 USD, dynamic strategy of same name; not a job quote. Orientation `image` (default) advertises max10s; `video` max30s. | Studio sends orientation but not `keep_original_sound` (live default true). Catalog describes motion transfer, not a guarantee about background/camera/frame accuracy. |
| `runway-act-two-recast` → `runway-act-two-i2v` | Character `image_url` + **`reference_video_url`** driving facial/head performance; character stays in image's static environment; optional aspect | Base $0.07 USD, strategy `runway-act-video`; no duration bound in inspected UI schema | **Contract mismatch:** recast entry sets videoField=`video_url`, and `processRecast` sends that field. Live detail requires `reference_video_url`. Not safely production-ready merely because UI exists. |
| `wan2.2-animate-recast` → `wan2.2-animate` | Image + video, holistic motion/expression transfer; live modes `animate` and `replace`; optional prompt, resolution | Base $0.35 USD, strategy `wan2.2-animate`; advertised ≤120s, 480p/720p; default mode animate, default480p | Recast UI/service do not send mode or resolution. It cannot explicitly choose replace through this path, so calling every Wan result an in-place body swap would overclaim. |

Only public GET metadata was refreshed. No cost estimates, uploads or submissions.
These are catalog base prices; duration/quality/provider calculation can change the
actual charge. No empirical speed, quality, identity or cost comparison was made.

### Meaning and preservation limits

INFERRED functional labels: **BODY_SWAP / CHARACTER_RECAST / MOTION_TRANSFER /
PERFORMANCE_TRANSFER / IDENTITY_TRANSFER**, depending on selected backend. Output
is AI-regenerated performance, not deterministic pixel replacement. Body/clothing
appearance can follow the target image; exact wardrobe-local isolation is not
exposed. **SCENE_REBUILD is UNVERIFIED for Body Swap itself.** The default Kling
choice and Wan animate can reconstruct content; do not promise unchanged scenery.
Act Two I2V explicitly describes using the target image's environment, not source
video background preservation.

Source motion/expression transfer is the intended capability. Camera and timing
preservation are not established as exact invariants: orientation, generated frames
and duration limits matter. There is no frame mapping/timebase contract here.
Source-sound default is not proof of lip synchronization or byte-preserved audio.

### Adjacent Motion Control is broader and already exists

`MotionControlStudio.jsx` calls `processMotionControl` for `motion_transfer` or
`objects_swap`. The service builds different instructional prompts: rebuild with
reference performers/assets versus change characters/products/clothing while
retaining the rest. It uses the existing Seedance 2.5/2.0 endpoints, not a custom
WHIHM engine. It supports multiple image references, optional prompt/audio/seed
settings. Existing limits: 2.5 duration4–30s/max30 images; 2.0 duration4–15s/max9.
The UI requires at least one image even though live required_fields lists only
video_url. The service silently clamps/truncates, so a future deterministic adapter
should reject out-of-scope requests before submission rather than hide changes.

**Provider ambiguity:** current Seedance model description says retain location,
while the same live `video_url` field description says location is replaced. OGA's
motion-transfer prompt asks for a scene rebuild. Object-swap mode is a prompt
policy, not an exposed mask/region-lock algorithm. Treat location invariance and
exact object isolation as UNVERIFIED; preserve both evidence and requested intent.
Base catalog prices: 2.5 $1.50, 2.0 $1.00 USD, dynamic; no actual quote obtained.
The source additionally declares Intl/Spicy variants; these were not re-audited.

### Binding is not payload validity

CONFIRMED static checks: all three **recast aliases** and Seedance motion service
IDs have no `findRemote` route. `runway-act-two-i2v` itself does match the existing
I2V route, but its current catalog entry declares only image/aspect. Static
`mapReferenceParams` + supplemental mapping with both video key spellings retains
only `image_url`; the I2V service therefore lacks the required driving-video field
through that contract. Mark it **nominally bound, incomplete**, not ready.
Image-face-swap and dress-change have separate auxiliary input contracts consumed
by `buildImageInputPayload`; their inputs must not be judged from reference mapping
alone. No generation was used to establish these source-level distinctions.

## 6. Body Swap versus official Genjutsu concepts

H describes two product modes: motion-guided reconstruction and selected-element
replacement. It advertises character/product/wardrobe/location reference options
and preservation of source choreography/camera/timing. These are public product
claims, not evidence OGA uses Higgsfield's backend or achieves the same quality.

The following statuses describe the **exposed functional contract**, not tested
fidelity. NOT SUPPORTED means no dedicated control in this particular Studio;
it does not mean the broader provider cannot do it.

| Dimension | OGA Body Swap | OGA adjacent Motion/V2V | Official Genjutsu target (H) |
| --- | --- | --- | --- |
| Motion transfer | SUPPORTED, core intent | SUPPORTED, explicit intent | SUPPORTED, advertised |
| Performance/expression | SUPPORTED, model-dependent | SUPPORTED, model-dependent | SUPPORTED, advertised source-action reuse |
| Camera preservation | UNVERIFIED as invariant | PARTIAL: prompt/catalog intent, conflicting location evidence | SUPPORTED, advertised |
| Timing preservation | PARTIAL: source performance + model duration limits; no exact mapping | PARTIAL: duration controlled, exact mapping unverified | SUPPORTED, advertised |
| Identity replacement | SUPPORTED, image-guided | SUPPORTED, multiple references | SUPPORTED, advertised |
| Object/product replacement | NOT SUPPORTED as dedicated Body Swap operation | PARTIAL: objects_swap/edit prompt, no regional guarantee | SUPPORTED, advertised |
| Wardrobe replacement | PARTIAL: target appearance, no wardrobe-only lock | PARTIAL: references + instructions | SUPPORTED, advertised |
| Environment/location replacement | NOT SUPPORTED as dedicated Body Swap control | PARTIAL: edits/rebuild instructions | SUPPORTED, advertised |
| Broader scene reconstruction | UNVERIFIED | PARTIAL: reference/prompt guided | SUPPORTED, advertised |

Conclusion: **analogous to the character/performance-transfer use case**, not an
established Genjutsu equivalent. The adjacent OGA Motion Control and V2V paths
cover more of the broad intent than Body Swap alone. No private Higgsfield source,
reverse engineering, benchmark or backend identity claim is involved.

## 7. External Genjustsu workflow: actual architecture and selective value

Source: [sirioberati/Genjustsu-Open-Source-Workflow](https://github.com/sirioberati/Genjustsu-Open-Source-Workflow),
commit `40fd6615c2b7d940d4d7060e82de522292eefe99`, last default-branch commit
2026-10-08. Repository not archived; activity timestamp is not a maintenance SLA.
**MIT code**, with third-party/branding/media exclusions in `THIRD-PARTY.md`.

CONFIRMED source pipeline (`pipeline.py`, `workflow.py`, `seedance_bridge.py`):

1. Normalize ≤30s video to 24fps, longest side≤960, H264 intermediates via PyAV.
2. Separate source vocals/music through hosted Replicate `cjwbw/demucs` htdemucs.
3. Obtain colored depth through hosted `lucataco/depth-anything-video`; optional
   chenxwh/Hugging Face alternative. Latest depth schema/version is discovered.
4. Segment with hosted `lucataco/sam3-video` pinned raw-mask version; clean border
   components (`raw_masks.py`) and align masks/depth/original frame counts.
5. Composite depth foreground over original RGB background; inspect all frames.
   Optional local MediaPipe face mesh can replace or augment depth preparation.
6. Pitch isolated vocals +3 semitones with Rubber Band (time ratio1), embed them in
   guide video. Submit reviewed guides and primary/optional secondary references
   to **Enhancor Seedance 2.5** edit or multi_reference; human-face flag, draft first.
7. Preserve draft, explicitly request approved HD, retrieve generation, restore
   original compressed audio packets; small output-duration gaps may hold last
   frame. No generic arbitrary timeline is supplied.

The model stack is mostly **remote AI**, plus deterministic local preprocessing
and optional local face tracking. No ComfyUI graph/custom-node dependency or local
CUDA diffusion engine is configured in inspected sources. No full-body pose
extractor is implemented; MediaPipe here is face landmarks for one centered face.
Identity is supplied to Seedance through references, not learned locally.
Subject replacement includes object-prompt potential, but broad object/location
fidelity is UNVERIFIED; generation prompts/inputs are character-focused.

| Exact useful piece | What is materially useful | Adoption recommendation / limitation |
| --- | --- | --- |
| `raw_masks.py:segment_raw/clean_border_fragments` | Actual raw mask PNG sequence, explicit repair artifacts; not just colored preview | USE_EXTERNAL_COMPONENT conceptually for optional mask preparation. Retain provider/version provenance; hosted SAM cost and noisy-mask behavior remain. No new provider integration now. |
| `pipeline.py:composite` | Rejects mismatched/missing frame indices; inspectable depth/subject/background composite | Adapt alignment/validation pattern, not hard-coded24fps/person/audio assumptions. Generic temporal compositing remains future work. |
| `face_mesh.py`, `mesh_worker.py` | Optional facial landmarks/overlay guides and tracking-gap checks | Small isolated preparation capability only if needed. Fixed central crop, one face, downloaded landmark model and separate Python environment limit generality. |
| `mask_review.py:fingerprint/review/require_approved` | Review exact guide artifacts, invalidate approval when artifacts change | ADAPT_EXTERNAL_PATTERN to WHIHM's **existing** approval/dependency hashes; do not adopt a second approval engine or metadata store. |
| `audio_workflow.py:finish_preview` + tests | Restore original audio, reject major duration mismatch, record small last-frame hold | Useful future preservation/QC contract. Requires PyAV/codec/container acceptance; not guaranteed exact video timing. Do not implement finishing in this task. |
| `seedance_bridge.py:submit/submit_hd` | Resume saved requests, preserve draft versus HD and explicit approval boundary | Adopt intent/record linkage pattern only. Do not copy Enhancor polling/uploader/state files over working OGA/WHIHM runtime/history. |

Dependencies: pinned Python packages FastAPI/Uvicorn, PyAV, NumPy, Pillow, SciPy,
OpenCV, requests, gradio_client; Python3.12+ documented. Optional mesh setup uses
another Python3.12 venv with MediaPipe and different media-library versions.
`mesh_worker.py` downloads a landmark model on first use; default depth/SAM/Demucs/
Seedance inference is hosted, requiring provider accounts. No model downloaded here.

**Windows:** README recommends WSL2; `.venv/bin`, Bash and `.command` launchers are
not native portable-Windows integration. No GPU required for default hosted path;
local face tracking's actual hardware/performance portability untested. Not offline
end-to-end. No bounded multi-platform application packaging demonstrated.

**Quality/maintenance:** small modules and tests establish concrete repair/review/
resume intentions; reported end-to-end examples are author reports, not our tests.
Hard-coded24fps/960px, audio-required preparation, one/two named reference roles,
latest-version depth lookup, no general DAG, direct JSON writes and coarse polling
make it a narrow recipe, not canonical infrastructure. Pinned packages are not
proof of tested native Windows installation. Do not execute its agent/setup prompts.

**Security:** media is uploaded to additional providers/public hosts; optional
cloudflared webhook/tunnel changes the exposure model. `media_host.py` uses hosted
transfer/fallback services. These need separate consent, endpoint validation and
retention review before any adoption. Never copy credentials, sample footage,
TEIN branding, auto-download behavior or arbitrary server/path surfaces into WHIHM.

## 8. Direct Body Swap versus external workflow comparison

All quality/speed judgments below are INFERRED from structure; no comparative
render benchmark was performed. Both are alternatives, not interchangeable promises.

| Dimension | Existing OGA/MuAPI Body Swap | External Genjustsu recipe |
| --- | --- | --- |
| Main use | Direct image-guided character performance/recast | Prepare reviewed guides for subject replacement, then regenerate with Seedance |
| Required inputs | One character image + driving/source video | Default path source video with audio + primary reference; optional second reference, segmentation subject prompt |
| Motion fidelity | Model intends transfer; measured fidelity UNVERIFIED | Depth/mesh carries structure; measured superiority UNVERIFIED |
| Camera | No explicit camera-lock contract | Original background in guide; generative output not guaranteed camera-identical |
| Timing | Orientation/model limits, no exact mapping | Normalizes24fps; output gap handling can hold frame; source audio restored, not exact original video frames |
| Identity | Target image; model-dependent | Image or reference video, prompts, mesh/depth-guided synthesis; no proven identity guarantee |
| Body/wardrobe | Character appearance through image; no regional isolation | Mask/subject guidance gives inspectable control, not proven wardrobe-only editing |
| Object replacement | No dedicated Body Swap control; adjacent OGA Motion/V2V exists | Subject prompt can target objects; character-focused submission, broad fidelity UNVERIFIED |
| Environment | No dedicated control; target image environment may dominate | Guide retains RGB background; arbitrary scene reconstruction remains prompt-based |
| Control granularity | Small source/image/prompt/orientation contract | Intermediate masks/depth/mesh, repair/review, draft/HD/audio stages |
| Quality potential | Fewer stages, less guide-preparation burden | More inspectable guidance; normalization can lose source detail and add failure modes |
| Speed | One main generation after upload; actual latency unknown | Multiple hosted jobs, preprocessing, review, uploads; likely slower, not measured |
| Cost | One selected model quote + transfer; live base prices above | Demucs + depth + SAM + draft + HD; total UNVERIFIED, no cheaper-than-MuAPI claim |
| Local/offline/GPU | Remote, no local GPU required | Local UI/preparation, mostly hosted AI; not offline. No CUDA requirement in default path |
| Integration | Small existing-service wrapper after concrete contract fixes | New Python/resource/provider/hosting boundaries; substantially larger |
| Maintenance | OGA/client + MuAPI model contract | Separate young recipe plus multiple model/provider/library versions |
| License | Keep existing OGA/provider terms | MIT code; model/provider/third-party/media terms separate |
| Windows/data portability | Existing app host + relative project assets; remote reconnect | WSL-oriented scripts/venvs/paths; requires adaptation, not copyable live environment |
| Astra composability | Natural optional node/executor once bound | Decompose into optional prep/review/generate/restore nodes, not mandatory global pipeline |

Explicit decisions: Body Swap is **functionally sufficient as a candidate** for the
main image+performance recast use case, subject to payload corrections and later
quality acceptance. It is narrower in controllable regions, multi-reference scene/
object work and inspectable preparation. It is simpler because OGA already handles
upload/lifecycle/results and requires fewer services. Selective external alignment,
raw-mask and source-audio contracts are useful. **Wholesale integration is not
justified.** Preserve the option of multiple executors, but do not add a costly
external executor until its extra control is needed and validated.

## 9. Other known repositories: selective findings

Snapshots below were read from immutable commits. `pushed_at` is not necessarily
last default-branch activity; dates shown are commit dates. None was installed,
launched, cloned into OGA or used to make a provider call.

### wide-trace/open-higgsfield

[Source](https://github.com/wide-trace/open-higgsfield), commit
`b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`, 2026-09-17. Not archived. No LICENSE
file or explicit package license was found in inspected root/tree/README evidence:
**copy permission UNVERIFIED**, so architectural reference only pending permission.

CONFIRMED useful pattern: `src/generation/catalog/types.ts` defines media roles
start/end/reference/video/audio with per-model cardinality, typed settings and a
single generation request (`GenerationPlane`). `plane.ts:assemblePlane` assembles
roles; `to-platform.ts` maps them to model-specific paths/payloads, including Kling
motion and Seedance edit/extend. `src/openhiggsfield/asset-picker.tsx` and
`media-tray.tsx` combine uploaded/history choices, media-kind filters and role limits.
This is a clearer reference-selection vocabulary than scattered Studio state.

**ADAPT_EXTERNAL_PATTERN:** project role assignments/cardinality may eventually
project into OGA's existing `modelCapabilities.js`, `videoMediaInputs.js` and input
contracts. No new canonical workflow format or copied UI is needed. Do not copy
model limits into a second catalog, silently discard extra references like
`assemblePlane`, or substitute its platform endpoints for MuAPI. Next16/React19.2/
Zustand/server-action/browser-storage stack is not a drop-in Electron module.
Its httpOnly credential cookie is a web boundary pattern, not a desktop vault.
No verified new body/object swap engine, pricing authority or offline fallback.

### TechBeme/open-higgsfield

[Source](https://github.com/TechBeme/open-higgsfield), commit
`1df1148e46d1b47d29e117b7bb1971a65c4286ee`, 2026-09-02. Repository pushed timestamp
is later; do not describe that as a newer implementation commit. MIT LICENSE exists.

CONFIRMED useful exact components:

- `src/providers/types.ts`: provider-neutral request plus discriminated synchronous
  completed-assets versus asynchronous operation submission; normalized poll results.
- `src/providers/registry.ts`: Freepik, Google AI Studio, Vertex and Vercel gateway
  selection using existing capability metadata. This is not automatic local fallback.
- `src/models/canonical.ts`, `capabilities/types.ts`, `adapters/base.ts`: media roles,
  optional parameters, endpoint/payload adapters and validation. A request abstraction,
  not a canonical workflow format to import over WHIHM.
- `src/lib/generation-service.ts`, `generated-assets.ts`: normalize immediate/async
  results into task assets; useful conceptual distinction for future provider choice.
- `src/lib/storage-paths.ts`: configurable root; task-store supports persisted history
  with file/database paths. The local store has a direct-write fallback after rename
  failure, which should **not** replace WHIHM's stronger history/project semantics.

**ADAPT_EXTERNAL_PATTERN**, selectively under MIT when a second provider is actually
needed. Keep OGA clients, polling and WHIHM project store now. Next server routes,
Google/cloud credentials, optional database/object storage and upload services make
whole-subsystem transplant inappropriate. Provider docs mention Cloudinary while
`media-upload.ts` calls a Tmpfiles adapter: inspected source, not README alone,
should determine any future integration. No end-to-end price abstraction superior
to WHIHM quote/budget evidence was established. No new media operation is unlocked
merely by adopting a registry.

### Autom8AI/Open-Higgsfield-AI

[Source](https://github.com/Autom8AI/Open-Higgsfield-AI), commit
`ee9cc30573eb450139b375a5dd19ed8438b90a37`, 2026-10-25. Current fork differs from
older MuAPI-only descriptions: `packages/studio/src/kie.js` submits/polls KIE jobs;
`netlify/functions/_fal-generation.js` adapts Fal/Airtable results and credit hints.
Cinema/Image/Video/Lip Sync components remain close to the app family OGA already
provides. Its README asserts MIT, but no standalone grant text was found in tree;
verify attribution/permission for fork additions before copying.

**NOT_NEEDED** for replacement Studios/desktop architecture. Provider-specific
result parsing is only an optional reference if those providers are later selected.
No stronger character/motion tool was established. Do not import its additional
poller, Netlify/Airtable state or heuristic provider-credit formulas as authoritative
quotes. Its `electron/main.js` sets `webSecurity: false`; explicitly reject that
pattern. Native packaging scripts do not solve WHIHM's current source/core package
coverage or portable-data requirements. No packaging work is proposed.

### SamurAIGPT/muapi-cli

[Source](https://github.com/SamurAIGPT/muapi-cli), commit
`147ebb5e7c388edb71acf13422b78793e1f5c95f`, 2026-10-22, Python package version0.2.7.
`pyproject.toml` declares MIT; no standalone LICENSE text found. Retain attribution
and verify distribution notices before copying. Python≥3.9, Typer/Rich/httpx/keyring.

CONFIRMED useful exact patterns: `muapi/schema_introspect.py` resolves OpenAPI refs
with a one-hour, base-URL-aware cache; `commands/models.py` / `dynamic_help.py` expose
model/schema information; `commands/run.py` merges structured inputs and implements
`--dry-run` before generation; `exitcodes.py` makes auth/billing/validation/timeouts
machine-readable. JSON output and no-wait/request-ID modes are practical agent
surfaces. `commands/workflow.py` discovers workflows, but create/edit explicitly
call the remote **architect**: do not use those commands for deterministic WHIHM edits.

**ADAPT_EXTERNAL_PATTERN** for future agent-facing introspection. The CLI does not
make catalog-only models safe existing WHIHM bindings, and default `run` executes
and waits unless dry-run is requested. Do not bypass host authorization/readiness/
quote policy with unrestricted CLI execution. `config.py` uses environment/keychain
then a plaintext per-user fallback; do not export that configuration with projects.
No need to install the CLI or embed another SDK/poller in OGA.

No additional repositories were sought: these known sources and existing OGA
already cover the relevant alternatives. A GitHub shopping list would not close
an actual capability gap.

## 10. Tier 1: Astra decision guide

Tiering measures strategic leverage, not model count. All recommendations below
are INFERRED planning policy; preservation claims are only the advertised model
intent. Costs require externally supplied request-specific quotes. No automatic
paid execution follows from selecting an executor.

| Tier 1 intent | Required / optional inputs | Preserve versus change | Prefer / avoid | Alternatives, cost/locality, current accessibility |
| --- | --- | --- | --- | --- |
| Create an initial image/video with minimal constraints | TEXT_ONLY/NO_REFERENCE; optional imagery/audio only if selected model needs/allows it | Creates new composition/action; no source preservation promised | Prefer when no source exists or structure should change freely. Avoid as an exact substitute for excellent existing performance. | Existing OGA T2I/T2V/I2V, local sd.cpp/Wan2GP where configured. Remote quoted; local resources/version-dependent. Existing bridge routes. |
| Character recast / performance reuse | SOURCE_VIDEO + ONE_IMAGE; optional prompt/orientation | Intended motion/performance retention, target appearance change; source camera/background not guaranteed | Prefer when source action is valuable and new character image exists. Avoid missing references, exact frame invariants, object-only edits or unsupported framing/length. | Kling recast, Act Two, Wan animate/replace; broader Seedance motion; eventual guided external recipe. Remote; recast binding missing and payload gaps identified. |
| Motion/camera/pose inheritance with multiple assets | REFERENCE_VIDEO + MULTI_IMAGE; optional prompt/audio/seed/duration | Transfer choreography/blocking/camera intent; recast or rebuild; location conflict noted | Prefer source-guided staging across identities/products. Avoid assuming actual camera solve, exact timing or guaranteed untouched scenery. | Existing Seedance Motion Control; Kling for one-character motion; V2V edits; full regeneration when source unfit. Remote dynamic price; unbound specialized service. |
| Object/product/wardrobe/environment edit | Existing image/video + intent; optional references/MASK | Change selected visual content; preservation outside region is model intent, not verified lock | Prefer source shot is useful and scope of change is narrow. Avoid if exact product geometry/text or pixel identity is nonnegotiable without QC. | I2I/inpaint/try-on for stills; Motion objects_swap; Aleph/Seedance/Wan V2V; raw-mask guide alternative. Stills mostly bound, video not. |
| Controlled V2V restyle/relight/scene treatment | SOURCE_VIDEO + text; optional image/audio according to schema | Reinterpret source visuals/motion; can alter details | Prefer meaningful source-guided visual revision. Avoid expecting remux/trim, exact audio retention or an in-place deterministic edit. | Aleph, Seedance edit, Wan edit and appropriate existing catalog editors. Remote; unbound V2V bridge. |
| Identity/product-consistent commercial assets | ONE_IMAGE/MULTI_IMAGE for reference intent; garment+person for try-on; optional scene/brand prompt | Retain identity/product intent while changing setting/style/outfit | Prefer reusable hero/product references and ad variants; use source-free generation when no references exist. Avoid claiming trained identity or exact logo/text fidelity. | Existing I2I, PuLID/Redux, product-shot/dress-change, Seedance Omni Marketing, workflow templates. Mostly bound primitives, high-level recipe not separately bound. |
| Keyframed shot / controlled composition | Start/end MULTI_IMAGE or ONE_IMAGE; optional motion prompt | Endpoint visual constraints; intermediate action generated | Prefer beginning/end composition matters. Avoid interpreting interpolated motion as guaranteed physical trajectory or exact frame interpolation. | OGA Video keyframes / model-specific I2V, reference-driven generation, source motion transfer. Existing variants bound where their metadata is complete. |
| Speech-driven performance / dubbing | AUDIO + ONE_IMAGE or SOURCE_VIDEO; language for translation | Match speech/lips; expressive timing model-dependent | Prefer supplied speech is authoritative. Avoid replacing genuine source acting unnecessarily or confusing dubbing with byte-preserved original audio. | Existing Lip Sync, Heygen translation, Act Two driven performance. Lip Sync bound; translation/V2V missing routes; Act Two payload gap. |

Tier2: extend/refine/upscale, semantic analysis/transcription/OCR/depth, segmentation,
AI clipping/captions, motion graphics, Layers/Cinema, reusable agent/workflow recipes,
local runtime availability and deterministic inspection/finishing infrastructure.
Tier3: secondary image-effect/AI-influencer recipe variants, convenience conversions,
watermark helpers and galleries (still reuse them). Tier4: duplicating Studios,
Apps marketing cards as runtime tools, new provider frameworks without a requirement.

## 11. Executor/integration status, including builder availability

CONFIRMED W currently binds six remote modes and configured local image/video
models. Provider-neutral canonical node types do not themselves create executors.
The existing builder fetches remote schemas, so a model catalog entry alone is
not proof of a current builder node. **B+** below means the prior live workflow
node-schema response (M) contained the exact endpoint ID; **B?** means builder
exposure not established, not impossible. Aliases are not provider endpoint IDs.

| Capability/endpoints | OGA web | Current Electron | Client/service | Builder evidence | WHIHM bridge |
| --- | --- | --- | --- | --- | --- |
| Image/video/audio normal generation | Image/Video/Audio | Image/Video; no Audio mount | Shared generation functions | M confirms multiple families | EXISTS_AND_BOUND for unambiguous recognized model+mode |
| `kling-v3.0-pro-recast` → Kling3 motion | Body Swap | Underlying Kling via Video V2V; no Body Swap mount | `processRecast`, also V2V endpoint | B+ endpoint | EXISTS_NOT_BOUND |
| `runway-act-two-recast` → Act Two I2V | Body Swap / I2V | I2V catalog; no Body Swap mount | `processRecast` field mismatch; I2V mapping gap | B+ endpoint | Alias unbound; endpoint nominally bound but incomplete |
| `wan2.2-animate-recast` → Wan animate | Body Swap | Underlying Wan via Video V2V | `processRecast`; no replace-mode forwarding | B+ endpoint | EXISTS_NOT_BOUND |
| Seedance2/2.5 motion transfer/object mode | Motion Control | No dedicated mount | `processMotionControl` | B+ endpoints | EXISTS_NOT_BOUND |
| `runway-act-two-v2v` | Video V2V | Video V2V, reduced controls | `processV2V` | B+ | EXISTS_NOT_BOUND |
| Aleph / Seedance edit / Wan edit | Video V2V | Video V2V, reduced controls | Shared + desktop V2V | Seedance edit B+; Aleph B? in sampled response | EXISTS_NOT_BOUND |
| `ai-image-face-swap`, `ai-dress-change`, `ai-product-shot` | Image | Listed in Image catalog; auxiliary/reference and scene-field parity not established by legacy desktop client | Shared `generateI2I` + auxiliary contracts | B? in sampled live response | EXISTS_AND_BOUND via shared service; no rendered acceptance test |
| Video face swap, Heygen translation, video background/upscale | Video V2V | Video V2V, limited parameter forwarding | `processV2V` | Heygen B+; others depend on exact snapshot | EXISTS_NOT_BOUND |
| Marketing Omni reference wrapper | Marketing | No dedicated mount | `generateMarketingStudioAd` | Omni endpoint B+ | Wrapper unbound; corresponding generation variant may be bound |
| Clipping / Vibe Motion | Dedicated Studios | No dedicated mount | `runClipping`, `runMotionGraphics/Edit` | M confirms public catalog; B? | EXISTS_NOT_BOUND |
| Lip sync | Dedicated | Dedicated | `processLipSync` | Model-dependent | EXISTS_AND_BOUND |
| Analysis/OCR/depth | Catalog, workflow/Design Agent surfaces; not uniform standalone Studios | No general analysis Studio | Various existing catalog/services | Depth/OCR B+ | No generic analysis route |
| Native raw masks / face-mesh guide / original-audio restoration | External recipe only | No host binding | External Python/provider recipe | No current binding established | EXISTS_EXTERNAL |
| Exact finishing | L/M gaps | No generic executor | Extension boundary exists | Declarative utilities ≠ executor | GENUINELY_MISSING generic implementation |
| Agents / Design Agent / Workflows | Existing UI/remote services | Agents/Workflows mounted; Design not | Existing service/submodule packages | Existing workflow engine | Not a deterministic canonical planner/execution scheduler |

Do not equate B+ or a downloadable template with validated whole-workflow support,
no-cost execution, or WHIHM binding. Conversely, B? does not justify rebuilding a
builder/service. Refer to M's public workflow evidence instead of re-running discovery.

## 12. Functional alternatives and creative capability map

These are intent groups, **not one canonical implementation**. All keep original
node IDs, references and provider/model identity explicit. Fallback/retry execution
is not introduced; Astra can propose another executor and validate it first.

| Astra intent | First candidate / alternatives | Inputs and locality | Cost/access/gap |
| --- | --- | --- | --- |
| GENERATE | OGA existing T2I/T2V/I2V; local sd.cpp/Wan2GP when ready | Text only or model-selected refs; cloud/local | Bound families; per-request quote or local resource limits |
| TRANSFORM | I2I / Aleph / Seedance / Wan edit | Image/video + intent; remote | Stills bound, V2V missing; preserve generative uncertainty |
| TRANSFER MOTION | Kling or Seedance motion / Wan Animate | Driving video + image(s); remote | Specialized routes missing; source suitability/length governs selection |
| TRANSFER PERFORMANCE | Act Two / Wan / Kling / optional mesh-guided Seedance recipe | Video + target image/video; cloud with optional local prep | Act Two contract fix; external recipe is heavier, not proven better |
| REPLACE IDENTITY | Body Swap / face-only swap / I2I identity / regeneration | One or more identity+source references; remote | Face image route bound; body aliases missing; do not use face swap for full-body job |
| REPLACE OBJECT | Motion objects_swap / V2V edit / still inpaint / masked guide | Source + intent, optional object refs/mask; remote/local prep | Video unbound; exact isolation not guaranteed |
| REPLACE ENVIRONMENT | V2V/I2I edit / Seedance motion rebuild / regeneration | Source + prompt, optional environment refs; remote | Location metadata conflict, no universal background-lock guarantee |
| CONTROL CAMERA/MOTION | Preserve good driving video; otherwise shot prompt/Cinema/keyframes | Reference video or text/images; remote/local gen variants | Prompt camera language ≠ trajectory solver |
| EXTEND | Existing chosen extension variant / regenerate next shot | Prior source/request ID; remote | Variant-specific binding/continuity/audio limits |
| ENHANCE | Existing image/video upscalers / depth/matting as needed | Image/video; remote | Image bound; video route missing, AI detail invention possible |
| SYNC | Lip Sync / Heygen dubbing / Act Two performance / later original-audio restore | Audio + image/video or driver; remote plus optional local post | Lip Sync bound; other contracts/gaps documented |
| ANALYZE | Whisper/OCR/depth/vision/audio understanding | Only relevant media; remote | No general analysis route; generated descriptions are not measured QC |
| ASSEMBLE | Existing MuAPI Video Combiner / later local exact timeline | Ordered clips; remote/local future | M's narrow remote contract; exact controls still missing |
| FINISH | Existing optional watermark/Suno WAV paths; later exact local utilities | Only requested assets; remote/local | Reuse M decisions; no mandatory finishing pipeline |

## 13. External adoption safety and isolation

| Candidate | License evidence | Dependencies / portability | Security / merge risk | Safe adoption boundary |
| --- | --- | --- | --- | --- |
| Genjustsu | MIT code; retain notice; third-party/branding/media excluded | Python/PyAV/Rubber Band, extra mesh venv/model, hosted providers; WSL-oriented | Extra upload/tunnel/provider exposure; hardcoded recipe and direct file state; copying whole flow would duplicate history | Isolated optional preparation component or contract pattern, later authorization; no wholesale application |
| wide-trace | No explicit grant established | Next16/React19/Zustand, browser/server split | Cookie auth/platform routes/browser persistence not desktop/project equivalents; material UI fork risk | Re-derive role/capability pattern; no source copying until permission clear |
| TechBeme | MIT LICENSE confirmed | TS/Next/cloud SDKs/optional database/host services | Server credentials, external upload handoff, another task store/poller; metadata/source drift | Adapt provider request/result boundary only when second provider needed; keep WHIHM persistence |
| Autom8AI | README asserts MIT; standalone grant not found | OGA-like stack plus KIE/Fal/Netlify/Airtable | webSecurity:false rejected; duplicate client/poller/heuristic costs; divergent fork | Reference only; no justified component transplant now |
| muapi-cli | MIT declared in pyproject; full standalone notice absent | Python3.9+, Typer/httpx/keyring; no GPU | Generic run can spend; architect not deterministic; plaintext credential fallback | Agent/schema UX pattern or separately installed optional tool later; never a second embedded runtime |

No repo's marketing label, star count, recent push or test file proves output
quality, native Windows support or secure arbitrary input handling. Code reviews
here are focused source inspections, not full security audits or test execution.
Prefer small adapter/pattern → isolated workflow → copied subsystem → whole-repo
adoption. No current evidence justifies the final option.

## 14. Already exists in OGA/MuAPI — not cleanly bound in WHIHM

Ranked by creative leverage, not model quantity:

1. **Body/character/performance recast:** `processRecast`, existing three-alias
   catalog and Studio. Fix Act Two driver-field mismatch and expose Wan replace
   choice deliberately; retain Kling options. No replacement model engine.
2. **Seedance motion/object transfer:** `processMotionControl`, existing models,
   multiple refs and two intent modes. Preserve parameters and detect existing
   clamp/truncation before submission; clarify provider location ambiguity.
3. **General V2V / scene/object/product editing:** `processV2V` + existing metadata
   for Aleph/Seedance/Wan; same route unlocks video face swap, matting and upscaling.
   Reuse shared service rather than extending the limited desktop client's payloads
   into a second authoritative implementation.
4. **Act Two driven performance:** endpoint nominally I2V-bound, but reference video
   not mapped by current catalog; fix required media contract before calling it ready.
5. **Commercial multireference orchestration:** existing Marketing/Omni and templates
   plus already bound product-shot/try-on/I2I. Often a validated recipe over current
   nodes suffices; do not build a new ad generator or Studio.
6. **Specialist analysis, clipping, captions and motion graphics:** established M
   catalog/services, narrower missing bridge modes. Add only when workflow intent
   needs them; no new underlying SDK.
7. **Simple video watermark/ordered concat:** established M wrappers remain useful
   but lower creative leverage than transfer/edit bindings. Do not redo their audit.

## 15. External-only advantages, with limits

| Advantage | Exact source | Why current OGA/MuAPI is insufficient for this requirement | Difficulty / decision |
| --- | --- | --- | --- |
| Reviewable raw temporal masks and aligned depth-guided composites | Genjustsu `raw_masks.py`, `pipeline.py:composite` | Existing cutout/depth outputs do not establish an exposed reviewed raw-mask preparation contract | M/L isolated component later; USE_EXTERNAL_COMPONENT only with real need, retain current providers where suitable |
| Explicit local facial-motion guide and coverage diagnostics | `mesh_worker.py`, `face_mesh.py` | Existing transfer models are opaque; no current local landmark/preparation primitive found | M; centered single face, model setup and Python boundary; optional, not mandatory |
| Original-audio preservation acceptance contract | `audio_workflow.py:finish_preview`, `tests/test_media.py` | Remote AI audio options do not establish original compressed-packet restoration | M; adapt contract later, not complete finishing subsystem; timing/padding policy must be explicit |
| Unified media-role picker and per-role cardinality vocabulary | wide-trace catalog types/media-tray/asset-picker | OGA already has media fields/input controls; the advantage is coherent semantic projection, not a missing uploader | S/M pattern only, permission unresolved; derive from OGA metadata rather than replace catalog |
| Provider-neutral immediate versus asynchronous result contract | TechBeme providers/types and generation-service | OGA runtime is MuAPI-centric; helpful when genuinely adding another provider | M later; MIT pattern, no registry/task-store transplant now |
| Broad agent-facing schema help/dry-run/exit codes | muapi-cli schema_introspect/run/exitcodes | Existing WHIHM is programmatic, with no equivalent finished general agent CLI | S/M pattern later; don't bypass canonical edits or host authorization |

The artifact-review hash pattern is useful but **not external-only functionality**:
WHIHM already has approvals, dependency hashes, history and invalidation. The external
lesson is which media artifacts to include, not how to replace production state.
Autom8AI demonstrated no unique creative advantage sufficient to adopt its code.

## 16. Revised priorities — maximum five implementation tasks

Models below follow this task's requested reasoning-model choice; task size is
estimated scope, not a promise about runtime/model output quality. No task starts
as part of this audit.

| Rank | Task / size / recommended model | Capability unlocked / source to reuse | Likely files/layers and targeted acceptance |
| --- | --- | --- | --- |
| 1 | **Recast request contracts + minimal canonical binding**, M, GPT-6.1 Sol | Existing Kling/Act Two/Wan character/performance transfer | Existing `models.js:recastModels`, `muapi.js:processRecast`, media contracts where necessary; `lib/whihm-execution/{runtime,bridge}.mjs`, focused tests/docs. Correct driver-key mapping, explicit Wan mode support, required-media/limits; mocked submit/lifecycle, plan-only and authorized fake execution. No UI/new client/new provider. |
| 2 | **Bind existing Seedance Motion Control**, M, GPT-6.1 Sol | Multireference motion/object/wardrobe intent through existing `processMotionControl` | Same bridge/capability boundary; validate requested reference count/duration before upstream clamping, preserve mode/prompt/identity. Test two modes, quote identity, missing refs, no network. Do not claim exact camera/location preservation. |
| 3 | **Bind existing shared V2V service**, M, GPT-6.1 Sol | Aleph/Seedance/Wan edits, video swap/upscale/segmentation without new runtime | Existing `getV2VModelById`, `processV2V`, `videoToolCapabilities`, bridge checks; targeted model input/schema tests. No duplicate desktop poller/catalog or route-coverage rewrite. |
| 4 | **Astra-facing capability/intent projection**, M, GPT-6.1 Sol | Discover alternatives with required roles, limitations, binding status and supplied quote provenance | Nonvisual read-only projection over OGA catalogs/input contracts, bridge bindings and existing readiness; small docs/tests. No second source-of-truth registry, autonomous planner, live quote fetcher, marketplace or execution scheduler. |
| 5 | **Registered-asset media probe**, M, GPT-6.1 Sol | Trustworthy local duration/geometry/streams for precise constraints/QC | Keep L/M FFprobe inspection plan, existing project handles/utility boundary; bounded process + mocked/tiny-fixture tests, no download/render/UI/packaging. Address large-file import limitations separately when real jobs require it. |

**Exact next implementation prompt scope:** inspect the clean committed baseline;
repair only concrete recast/Act Two required-media compatibility and Wan mode
forwarding using the existing model/service/input-contract conventions, then add
the narrow canonical-node → existing `processRecast` route. Preserve node IDs/titles,
provider identity, uploads/polling/results/auth and project-relative assets. Require
plan/dry-run, missing-input/unsupported-option rejection, no silent parameter loss,
existing host execution authorization, and mocked transport tests for the three
recast aliases. Update existing docs. No UI, new provider/client/poller, workflow
schema redesign, local models, paid requests or external repo integration. If
required scope exceeds these contract/binding changes, report before expanding.

## 17. Explicit answers and audit QA

1. Body Swap regenerates a target character from source motion/performance; it is
   not deterministic body compositing or just face replacement.
2. Backends are Kling3 Pro Motion Control, Runway Act Two I2V and Wan2.2 Animate,
   through OGA aliases documented above; not universally Kling-only.
3. It is functionally analogous to Genjutsu's character/motion use case, not proven
   equivalent in quality, preserved pixels or broader scene editing.
4. It is narrower in reference count, masks, object/scene controls and inspectable
   preparation. Adjacent OGA Motion/V2V already addresses some broader intents.
5. It is easier to integrate: existing upload/client/lifecycle/results, fewer stages
   and accounts. Actual comparative speed/quality/cost remains UNVERIFIED.
6. Genjustsu adds explicit preparation/repair/review, optional face guides,
   draft/HD sequencing and original-audio restoration; mostly hosted inference.
7. Adapt raw-mask/alignment/guide/QC contracts selectively; reuse WHIHM state.
8. Reject wholesale app/provider/poller/storage/UI adoption, hardcoded mandatory
   audio/reference pipeline, sample branding/media and automatic setup/downloads.
9. wide-trace roles/picker, TechBeme provider/result contracts and CLI schema/agent
   affordances are useful patterns; Autom8AI adds no demonstrated must-adopt engine.
10. Recast, Seedance motion/object transfer and shared V2V are the leading existing
    capabilities without clean canonical bindings; Act Two nominal binding is incomplete.
11. Recast/performance, scene/object editing, identity/product reference generation,
    camera/motion guidance, speech synchronization and enhancement merit multiple choices.
12. Yes: creative binding work moves ahead of FFprobe. Exact-media infrastructure
    remains important, not obsolete or a prerequisite to every creative workflow.
13. Next task is the bounded recast compatibility-and-binding milestone in section16.

QA performed: baseline HEAD/status/submodules; read both prior audits; inspect all
major navigation/mounts, Body Swap/service/input contracts, static bridge/media
mapping; five targeted public metadata GETs; official Higgsfield comparison; five
external source snapshots/licenses/configs. No broad model discovery or repeated
finishing audit. No additional repos needed. No generation, paid requests, agents,
uploads, provider configuration, credential reads, installations, setup scripts,
model/binary downloads or runtime changes. Only documentation is changed.

Remaining uncertainty: backend acceptance/fidelity/latency/pricing by actual request,
location-preservation conflict, field mismatches pending correction, untested native
Windows external dependencies, incomplete external license notices, builder model
coverage outside the prior sampled schema. No claim of tested parity or superiority.
Before commit verify documentation-only diff, `git diff --check`, clean submodules,
and exclusion of unchanged `packages/whihm-workflow-core/NEXT_HISTORY_TASK.md`.
