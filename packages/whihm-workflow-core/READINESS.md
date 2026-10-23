# Whole-workflow readiness and budget reporting

`assessWorkflowReadiness(workflow, context)` is a pure, synchronous public API.
It returns one detached JSON report; it never runs a node, touches the filesystem,
looks up credentials, refreshes a quote, writes approvals, or enforces spending.
The canonical workflow remains unchanged. No dependencies are added.

```js
import { assessWorkflowReadiness, hashWorkflow } from 'whihm-workflow-core';

const report = assessWorkflowReadiness(workflow, {
  evaluatedAt: '2026-10-23T16:00:00Z', // required ISO timestamp; no implicit clock
  executors: [{
    id: 'remote', type: 'remote-model', provider: 'example',
    model: 'illustrative-image-model', available: true,
  }],
  assets: [{ id: 'logo', present: true }],
  inputs: { creative_brief: 'An externally supplied brief' },
  nodeStates: { storyboard: { manualResolved: false } },
  quoteContext: {
    schemaVersion: 1,
    workflowId: workflow.workflowId,
    workflowHash: hashWorkflow(workflow),
    quotes: [{
      nodeId: 'image', amount: 0.03, currency: 'USD',
      quotedAt: '2026-10-23T15:00:00Z',
      expiresAt: '2026-10-24T15:00:00Z', // optional
      provider: 'example', model: 'illustrative-image-model', // optional identity checks
      source: 'external-estimator', metadata: {}, // optional, no secrets
    }],
  },
  quotePolicy: { maxAgeMs: 86400000 }, // optional; defaults to 24 hours
  budget: { maximumSpend: 2, currency: 'USD' }, // optional; hard readiness requirement
});
```

Supply only relevant inputs/node states. Unknown context fields, malformed values,
duplicate quote/binding identities, unsupported quote-envelope versions, non-JSON
values and secret-bearing context are rejected with `READINESS_CONTEXT_INVALID`.
The original core validator supplies JSON/secret/path safety. Context diagnostics
never echo rejected values. The report includes canonical hash, explicit evaluation
time and the effective freshness policy so an agent can identify its evidence.

## Evidence and canonical policy extensions

- `executors` is a caller-supplied availability snapshot, not a second model catalog
  or registry. Bindings match `id`, `type`, `provider`, `model` and `tool` exactly,
  including absent fields. Strip canonical `mayCostMoney`, `requiresConfirmation`
  and `capabilities` flags from binding entries. One identity can cover many nodes.
  An absent inventory means unverified; a supplied empty inventory means unsupported.
  `available: false` means unavailable, with `UTILITY_UNAVAILABLE` for utilities.
  A host can project its existing runtime/catalog checks into these plain records.
- `assets` is explicit presence evidence, e.g. after existing project integrity/path
  checks. Declarations alone do not establish physical existence, checksum correctness
  or remote URL reachability. Missing from a supplied inventory means not present;
  omitting inventory means unverified. All `node.assetRefs`, structured `$asset`
  parameters and workflow asset-input values are checked. Referenced assets must be
  declared canonically. Unreferenced library assets do not prevent a production run.
  `asset.metadata.optional: true` makes missing/unverified presence a warning only.
- Workflow input values come from `context.inputs` or canonical defaults. Required
  inputs must have values of the declared primitive/cardinality type. Required node
  ports need a parameter, edge or provided workflow-input binding. This is generic
  port/interface checking, not a replacement for model-specific runtime validation.
- `node.executionPolicy.optional: true` declares an optional branch node. Disabled
  nodes are inactive; `context.nodeStates[id].active: false` may also exclude an
  optional node. Required nodes cannot be silently deactivated through context.
- All enabled nodes otherwise remain active, including nodes outside explicit output
  ancestry. Those are marked `outputReachable: false` and warned about, but their
  costs and blockers remain included. The assessor does not guess conditional
  branch outcomes, choose variants, or infer that an orphan paid generation is free.
- Manual gates are explicit `executionPolicy.manual: true`, an executor requiring
  confirmation, or a control tool named `approval`, `approval-gate`, `review`,
  `manual`, or `storyboard-review`. External `manualResolved: true` is a supplied
  statement for assessment only, not stored approval or execution authorization.
  Manual control gates require no generation binding. Other control tools (QC,
  merge, etc.) still require an actual runtime binding.

## Dependencies and status

Dependency information comes from the existing validator, including edges, explicit
node dependencies, structured `$nodeOutput`, and embedded `{{ node.outputs[0].value }}`
references. Input-default references also propagate to their target nodes. No new
workflow representation is created. Active cycles are reported as `INVALID` with
`DEPENDENCY_CYCLE`; the nested `validation` remains the unchanged canonical validator
result, which currently does not reject cycles itself. Disabled-only cycles are
inactive. A dependency from an inactive node into an active node blocks the consumer;
optional never means silently deleting a required connection.

Hard failures propagate to descendants as `UPSTREAM_BLOCKED`. Unresolved manual gates
propagate `UPSTREAM_MANUAL_PENDING` and waiting states, not hard technical failures.
Unverified capability/asset evidence propagates `UPSTREAM_UNVERIFIED`. These are graph
assessments, not queue states or proof that upstream outputs already exist.

- `READY`: canonical/active graph valid, required evidence available, no pending
  manual gates, all active costs known or explicitly not required, and any supplied
  budget satisfied. `ready` is true only here.
- `CONDITIONALLY_READY`: no hard blockers, but manual gates, unverified evidence or
  unknown costs remain without an imposed budget.
- `BLOCKED`: required asset/input/binding/dependency failure, exceeded budget,
  uncertain budget, or invalid assessment context.
- `INVALID`: canonical validation failure or an active dependency cycle.

Node states include `EXECUTABLE`, `BLOCKED`, `UNSUPPORTED`, `MANUAL_PENDING`,
`WAITING_MANUAL`, `UNVERIFIED`, `DISABLED_OPTIONAL`, `DISABLED`, and `INACTIVE`.
`EXECUTABLE` means technical evidence is satisfied, not authorization or immediate
scheduler dispatch. Global budget blockers are separately listed at workflow level.
Counts include blocked unsupported nodes in `blocked` and the `unsupported` subset;
`manual` counts pending/waiting node statuses, while `manualGates` identifies root gates.
`unknownCost` covers all active unquoted/stale nodes, including blocked nodes.

## Quote separation, freshness and costs

Quote envelope v1 is external to creative state, projects/history and snapshots.
It can be retained by a caller as portable estimate data; this milestone provides
validation/evaluation, not quote persistence. Its hash binds quotes to the exact
canonical workflow, including metadata/title edits: any canonical change makes the
old envelope stale. Do not rebind old quotes to a new hash without external estimate
verification. Canonical JSON formatting/object-key order changes leave the hash intact.

One quote per node; no automatic latest-quote selection. A quote is `CURRENT` only
when the envelope ID/hash and any supplied model/provider match, it is not in the
future, its age is strictly less than `maxAgeMs`, and its expiration has not been
reached. Otherwise it is `STALE`; absence of a required quote is `MISSING`. Stale prices are excluded
from current known subtotal and included in both `staleNodeIds` and `unknownNodeIds`.
No quote refresh or live API is invoked.

`executor.mayCostMoney: false` explicitly declares no quoted monetary charge for the
node (`NOT_REQUIRED`, cost zero); this does not estimate electricity/hardware costs.
A supplied quote overrides that declaration, so a positive quote cannot be ignored.
Paid nodes need quotes even when their actual quoted amount is zero. All active
nodes count once; quotes must cover the intended node operation, including any
variants the caller intends to generate. Retries, future usage and past spend are
not estimated or tracked here.

`cost` reports `knownSubtotal`, `currency`, per-currency `totals`, quoted/unknown/stale/
zero-cost IDs, and separately excluded-node quote totals. Unknown is never counted
as an explicitly zero-cost node. A known subtotal of zero with unknown IDs is not
an estimated total of zero. Mixed currencies yield null aggregate subtotal/currency;
no conversion is invented. Amounts accept nonnegative JSON numbers up to
`Number.MAX_SAFE_INTEGER` with at most 12 decimal places. Arithmetic/comparisons use
integer decimal units. Per-currency `exactAmount` strings preserve exact sums; numeric
amounts become null if they cannot be represented without loss at that precision.
No BigInt crosses the public JSON boundary.

Budget status:

- `NO_BUDGET`: no externally imposed limit.
- `OVER_BUDGET`: the known subtotal in the budget currency already exceeds the limit,
  even when additional costs are unknown.
- `BUDGET_UNKNOWN`: an active cost is missing/stale or a quoted currency cannot be
  compared to the budget currency. This is a hard `BUDGET_UNCERTAIN` readiness blocker.
- `WITHIN_BUDGET`: all active costs are usable/comparable and the subtotal is less
  than or equal to the limit. This is planning evidence, not a spend guardrail.

## Director fixture and checks

`fixtures/director-readiness.json` is a fictional 10-node production graph: image,
reference edit, manual storyboard, two video generations, assembly, QC and export,
plus disabled premium and SFX branches. Logo/music assets are declared. Tests supply
fake known/unknown quotes and availability evidence; the result exposes missing logo,
unavailable assembly, downstream failures, pending review, USD 0.53 known active cost,
one unknown video cost, excluded USD 3 premium quote and `BUDGET_UNKNOWN` together.

```sh
node --test packages/whihm-workflow-core/tests/readiness.test.js
npm test -w whihm-workflow-core
npm run check -w whihm-workflow-core
```

No runtime/bridge/UI/Electron/provider code changes are required. Future host code
may gather evidence from existing services and call this API. Live capability/model
validation, approval enforcement, spend enforcement, execution scheduling, automatic
quote refresh, finishing and selective quote invalidation remain separate work.
