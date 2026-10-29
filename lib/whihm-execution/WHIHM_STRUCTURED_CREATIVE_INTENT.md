# Structured Creative Revision Intent v1

Objective outcomes can now include `id`, `artifactId`, and an
`objective_measurement` rule. These become explicit requirements in fresh QC after
revision. Supported measurable families are `timeline`, `audio`, `visual`,
`segment`, `face`, `mask`, `target` and `audio_timing`; specialized families must
bind registered evidence to the source checksum and (for target facts) an explicit
canonical target ID. See `WHIHM_OBJECTIVE_EVIDENCE.md`; descriptions alone remain
advisory.

External directors supply creative decisions. Creative Revision validates and
translates them to its existing bounded corrections, Agent Execution authors the
workflow, Workflow Execution executes, and Creative QC evaluates new artifacts.
No model API or additional execution surface is involved.

Add `structuredIntent` to a revision request v1 with `intents: []`. All original
QC checksum, artifact integrity, workflow revision, approval, provider uncertainty
and two-cycle checks remain authoritative. Every selected finding must have an
explicit change; invalid or unsupported changes reject the entire plan.

Example (inside a complete checksum-bound revision request):

```json
{
  "schemaVersion": 1,
  "sourceFindingIds": ["timing"],
  "revisionGoal": "Bring the impact forward to the authored cut.",
  "requestedChanges": [{
    "findingId": "timing",
    "target": {"type": "audio_event", "nodeId": "mix", "id": "hit"},
    "operation": "move_event",
    "value": 1
  }],
  "preserve": [{"type": "final_duration", "nodeId": "mix"}],
  "requires": ["PRODUCE_AUDIO_MIX"],
  "acceptableSideEffects": ["rerender_audio"],
  "expectedOutcomes": [
    {"type": "objective", "description": "Impact begins at frame 1."},
    {"type": "subjective", "description": "A stronger sense of impact."}
  ]
}
```

Targets use stable node and item/event IDs. Supported mappings:

| Target | Operations |
| --- | --- |
| timeline_item | move_start, change_duration, trim_source, adjust_gain |
| audio_event | move_event, change_event_duration, trim_source, adjust_gain, adjust_pan, adjust_fade, adjust_pitch, adjust_time_stretch |
| audio_master | adjust_gain |
| timeline_output | change_canvas, change_duration |

`value` is the canonical parameter value: integer frames for timing, dB for gain,
canonical pan, canvas or Audio Production manipulation objects as applicable.
`adjust_fade` sets fade-in frames. Pitch/stretch use the existing full manipulation
contract; canonical Audio/Timeline validation enforces parameter bounds and exact
timing. No relative edits, source replacement, semantic target guessing or new
editing primitives are provided. Unknown operations return
`REVISION_UNSUPPORTED_CHANGE`; target/constraint failures return structured
revision diagnostics. Nothing is partially applied.

Preservation types are `final_duration`, `node`, `audio_event`, `timeline_item`.
All require nodeId; item/event rules also require id. Node preservation protects
the whole production definition. The planner compares original and candidate
definitions exactly, rejecting conflicts before Agent planning. Broader descendant
preservation and semantic annotations are deferred.

`requires` currently accepts capabilities already bound by the target production
workflow (COMPOSE_TIMELINE / PRODUCE_AUDIO_MIX). Existing Agent validation supplies
runtime readiness and exact binding checks. This narrow foundation does not add
capabilities or select providers. Rerender declarations are required for each
change family. `remote_provider` is only a declaration, never authorization;
existing Agent/Revision remote approval controls remain mandatory.

Expected outcomes are bounded descriptions classified objective or subjective.
Descriptions are retained without parsing. Objective outcomes with explicit typed
rules become additional requirements in fresh QC; original bound requirements
remain in force. Subjective evaluation and confidence metadata remain deferred.

Proposals retain the submitted intent and stable intentHash alongside the existing
finding/action mapping and Agent plan. Set-like finding/capability/side-effect
lists are sorted for hashing; ordered changes retain order. No timestamps or
session observations enter intent identity. Existing append-only revision records
retain intent lineage through execution and new QC; old QC is unchanged.
