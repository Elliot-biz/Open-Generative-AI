# Portable local history v1

This is local **user/project data**, not application packaging. Node >=20.19 and
compatible workflow-core are required to read it. No dependency on a checkout,
WSL, Electron, providers, model execution, or browser storage is recorded.
There are no new dependencies. Canonical Workflow Document v1 is unchanged.

## API

```js
import {
  createHistoryStore, applyEditBatch, hashWorkflow,
} from 'whihm-workflow-core';

// rootPath is supplied by the application/user, never stored in history.
const opened = await createHistoryStore(rootPath);
if (opened.status !== 'ready') return opened;
const history = opened.store;

const batch = {
  commandVersion: 1,
  expectedWorkflowHash: hashWorkflow(current),
  commands: [{ type: 'rename-node-title', targetId: 'clip', value: 'Final clip' }],
};
const result = applyEditBatch(current, batch);
const saved = await history.recordEdit({
  before: current, result, batch,
  // Optional optimistic history-head guard (null means no prior record).
  expectedLatestRecordId: latestRecordId,
  reason: 'Rename only', actor: { source: 'agent' }, metadata: {},
});
if (saved.status !== 'recorded') return saved;
current = result.workflow;

const restored = await history.rollbackToRecord({
  current,
  workflowId: current.workflowId,
  targetRecordId: earlierRecordId,
  expectedCurrentHash: hashWorkflow(current),
  expectedLatestRecordId: saved.recordId, // required for rollback, prevents ABA
  reason: 'Restore approved version',
});
if (restored.status === 'restored') current = restored.workflow;
```

Operations are asynchronous and return structured results. They never edit the
caller's workflow object. Write requests are detached before the first await.
The application must adopt the returned state only after a successful commit.
This store does not write a separate application workflow file: its latest record's
after-snapshot is its current state. Transactionally coordinating other project
files is outside this milestone.

| Store method | Result on success |
| --- | --- |
| `recordEdit({before,result,batch,expectedLatestRecordId?,reason?,actor?,metadata?})` | `recorded`, workflowId, recordId, beforeHash, afterHash, diff, record, diagnostics, warnings |
| `listHistory(workflowId)` | `ok`, records in sequence order, diagnostics, warnings |
| `getHistoryRecord(workflowId,recordId)` | `ok`, record, diagnostics |
| `getLatestHistoryRecord(workflowId)` | `ok`, record (null for empty history), diagnostics |
| `getWorkflowAtRecord(workflowId,recordId,side='after')` | `ok`, detached workflow, diagnostics; `side='before'` recovers the initial pre-edit state |
| `compareHistoryRecords(workflowId,recordA,recordB)` | `ok`, beforeHash, afterHash, diff, diagnostics (compares after-states) |
| `rollbackToRecord({current,workflowId,targetRecordId,expectedCurrentHash,expectedLatestRecordId,reason?,actor?,metadata?})` | `restored`, same fields as recorded plus detached workflow |
| `verifyHistoryIntegrity(workflowId)` | `valid`, recordCount, diagnostics, warnings; otherwise `invalid` with diagnostics |

Other failures return `rejected` with `{code,path,message}` diagnostics. They do
not echo input payloads or absolute filesystem paths. `createHistoryStore` returns
`{status:'ready',store,diagnostics:[]}` or a rejected result. The store handle itself
is an API object; records/read/write results are JSON-serializable data.

`recordEdit` requires the original **full batch**, because the existing edit result
preserves commands but not every batch-level precondition. It checks successful
status, validation, current canonical before/after hashes, workflow identity,
command and diff equality, and replays through `applyEditBatch` to verify the claimed
transition. No edit logic is duplicated. Dry runs and rejected edits cannot be
recorded. Valid no-op edits can be recorded as explicit checkpoints.

## Layout and format

```text
<caller-selected-history-root>/
  store.json
  workflows/
    <sha256-of-logical-workflow-id>/
      manifest.json
      records/<random-uuid-v4>.json
      snapshots/<canonical-workflow-sha256>.json
```

`store.json`: `{historySchemaVersion:1,kind:'whihm-workflow-history'}`.
Workflow manifest: `{historySchemaVersion:1,workflowId,records:[recordId,...]}`.
The ordered manifest is the commit authority. Sequence, not clock order, orders
history. The directory digest only safely namespaces logical IDs (including IDs
with characters Windows disallows); workflow state hashing always uses the existing
`hashWorkflow` implementation. Logical IDs remain in records/manifests.

Each record has exactly these fields, enforced by the reader:

| Field | Meaning |
| --- | --- |
| historySchemaVersion | Integer 1; unknown versions refused, no silent migration |
| recordId | Random UUID v4 from Node crypto |
| workflowId | Canonical logical workflow identity |
| sequence | 1-based position in the manifest |
| timestamp | UTC ISO timestamp, descriptive rather than ordering authority |
| previousRecordId | Previous committed record ID, null for first record |
| operation | `edit` or `rollback` |
| restoredFromRecordId | Earlier record whose after-state is restored; null for edits |
| beforeHash / afterHash | Existing canonical SHA-256 workflow hashes |
| beforeSnapshot / afterSnapshot | Exact relative `snapshots/<hash>.json` references |
| commandBatch | Complete edit batch, or null for a rollback |
| diff | Existing `diffWorkflows(before,after)` result |
| validation | `{valid:true,warnings:[...]}` for the validated after-state |
| reason / actor / metadata | Optional annotations stored as null/null/{} by default; actor is an object |

Snapshots use `exportWorkflow`, preserving all canonical fields. Equal hashes reuse
snapshots; an existing snapshot must verify before reuse. Record IDs are checked for
collisions. Records and snapshots are never overwritten by ordinary operations.
Unknown record/manifest fields fail closed. Future format migrations should operate
on a separate copy with explicit version handling and tests, not mutate old records.

## Commit, concurrency and recovery guarantees

One exclusive directory lock (`.write-lock`) serializes writers across store
instances/processes. Contention returns `HISTORY_STORE_BUSY`; there is no automatic
retry or stale-lock stealing. Readers need no lock because the manifest is replaced
atomically and referenced files are immutable. Every operation verifies the store
version; every read/write verifies the workflow's full committed chain.

A write holds the lock while checking the latest committed hash (and optional
expected head), saving snapshots and a record, and publishing the new manifest.
Files are written to unique same-directory temporary files, flushed, closed, then
renamed. The final manifest rename is the commit point. Failed earlier writes may
leave unpublished snapshots/records; these are never listed or adopted. Existing
committed records remain readable. A failed first edit has an empty committed
manifest to support safe retry. Temporary files are removed on handled failures.

Directory flushes are attempted on supported systems. Windows can refuse directory
fsync; guarantees rely on the local filesystem's atomic rename behavior. This is
not a claim of hardware power-loss safety on every filesystem, network share, or
USB filesystem. Native Windows execution has not been exercised by the Linux test
suite. Copy/backup an idle store after closing writers; live multi-file backup is
not provided. Do not remove external storage while writes are in progress.

If the process is killed, `.write-lock` may remain. Stop all writers, back up the
store, inspect/verify the committed manifest, and only then manually remove the
abandoned lock. There is no automatic destructive recovery. Unpublished artifacts
produce `HISTORY_UNCOMMITTED_ARTIFACTS`; retain them for recovery review rather than
silently deleting them. A workflow directory missing its manifest is rejected,
not reinitialized. Unknown nonempty roots are never adopted.

A directory-flush failure after rename reports a durability warning, not a false
rejection of a committed record. Failure to remove a writer lock after a successful
operation reports `HISTORY_LOCK_CLEANUP_REQUIRED`.

Tests may supply `createHistoryStore(root,{beforePublish(kind){...}})` and throw
before publication of `store`, `initialize-workflow`, `snapshot`, `record`, or
`manifest`. This synchronous hook is for fault injection only, never persisted or
used to implement application behavior.

## Rollback and integrity

Rollback requires both the current workflow hash and latest record ID. It validates
the entire chain and target snapshot, then appends a rollback record with the current
before-state and the target after-state. It uses the existing semantic diff. All
intervening records remain readable. Returned workflow data is detached. Hash plus
record-ID checks also reject stale callers when state changed away and back to the
same hash (ABA). Rollback to a record restores its after-state; this API does not
silently reinterpret version numbers or restore a record's before-state.

Verification detects malformed/unsupported formats, missing records/snapshots,
duplicate IDs, identity/sequence/chain mismatches, unsafe paths, invalid workflows,
hash mismatches, diff mismatches, command replay mismatch, and invalid rollback
targets. Diagnostics fail closed at the first issue; repair is not automatic.
Safe relative paths and expected snapshot filenames are enforced, and symlinks
inside the managed store are refused. The local data root and its parent directories
must be trusted: this is not a sandbox against hostile processes racing filesystem
operations. Hashes are not signatures: valid annotation rewrites, consistent whole
history rewrites, or truncation by an attacker cannot be authenticated without an
external trust anchor. This is corruption detection, not tamper-proof audit storage.

Workflow and command validation retain existing secret checks. History annotations
reuse those checks and reject absolute path strings. Secret detection is heuristic;
do not place credentials or personal secrets in free text. Credentials must be
reconnected separately on the new machine. Paths in snapshots remain governed by
canonical workflow validation; semantic diff paths are logical pointers, not files.

Main errors: `HISTORY_VERSION_UNSUPPORTED`, `HISTORY_MANIFEST_INVALID`,
`HISTORY_RECORD_NOT_FOUND`, `HISTORY_RECORD_INVALID`, `HISTORY_RECORD_DUPLICATE`,
`HISTORY_CHAIN_BROKEN`, `HISTORY_SNAPSHOT_NOT_FOUND`, `HISTORY_SNAPSHOT_HASH_MISMATCH`,
`HISTORY_WORKFLOW_ID_MISMATCH`, `STALE_WORKFLOW_STATE`, `BEFORE_HASH_MISMATCH`,
`AFTER_HASH_MISMATCH`, `HISTORY_PATH_UNSAFE`, `HISTORY_WRITE_FAILED`,
`ROLLBACK_TARGET_INVALID`, `RESULTING_WORKFLOW_INVALID`, `HISTORY_EDIT_NOT_APPLIED`,
`HISTORY_STORE_BUSY`, `HISTORY_IO_FAILED`.

## Relocation and verification

Copy the complete idle root into a new project's `history/` directory and open it
with a compatible fresh application. No stored path rewrite or original application
installation path is needed. Actual referenced assets remain a separate project
component; history stores workflow declarations, not media bytes. Installers,
project manifests/archives, asset copying, cloud sync, providers, UI, and execution
are intentionally out of scope.

```sh
node --test packages/whihm-workflow-core/tests/history.test.js
npm run test -w whihm-workflow-core
npm run check -w whihm-workflow-core
npm exec --no -- eslint packages/whihm-workflow-core/src packages/whihm-workflow-core/tests
node --test tests/*.test.js
```

Tests use disposable temporary roots, simulate publication failure and conflicting
writers, corrupt copies of records, and move data to an unrelated root after deleting
the original root. They verify reading, integrity, comparison, and rollback after
relocation without an application installation path. No provider calls are made.
