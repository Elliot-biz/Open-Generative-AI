# Portable project data v1

A project is user data, not an application install. This additive Node API groups
canonical workflows, existing history, registered asset files, presets, reviews,
and export metadata under a caller-selected root. No new dependencies, provider
calls, media transformations, UI, database, archive dependency, or installers.

## Boundary and layout

```text
<project-root>/
  project.json
  workflows/<random-uuid>.json
  history/                         # unchanged history v1 store
    store.json
    workflows/<workflow-id-digest>/...
  assets/<random-uuid>.bin
  presets/<random-uuid>.json
  review/<random-uuid>.json
  exports/<random-uuid>.<extension>
```

Application code/binaries/runtime are installed separately. The project contains
portable user data only. Credentials must be reconnected on a new machine, not
restored from this folder. Caches, development checkouts, node_modules, Electron
profiles, temporary generation files and optional model weights are not project
data. This milestone does not build Windows installers, USB launchers, archives,
model installation, or credential storage.

Paths persisted in project data are project-relative with `/` separators.
Absolute paths returned by resolver helpers are ephemeral process-local results;
never persist them. No original username, drive, WSL installation, application
installation directory, or checkout is needed to reopen the data.

## Manifest and formats

`project.json` is the atomic registry/commit authority. Its exact required fields
are validated in `src/project/format.js`:

- `projectSchemaVersion: 1`, UUID-v4 `projectId`, `title`, `description`.
- UTC ISO `createdAt` and `updatedAt`, string-array `tags`, object `metadata`.
- `directories`: the six fixed relative directory names above (review is singular).
- `compatibility: {workflowSchemaVersion:1, historySchemaVersion:1}`.
- `mainWorkflowId`: a registered workflow ID or null.
- `workflows`: `{workflowId,path,hash}` references to canonical workflow JSON.
- `assets`: full asset records described below.
- `presets`: `{presetId,path,hash}` references.
- `reviews`: `{reviewId,path,hash}` references.
- `exports`: full export metadata records.

Unknown format fields/versions fail closed. No implicit migrations are performed.
Logical IDs remain authoritative independently of filenames or titles. New project
IDs and generated record IDs use Node crypto UUIDs. User-supplied logical IDs must
follow the core identifier convention. A handle retains its opened project ID and
rejects a swapped manifest. `openProject` accepts `expectedProjectId` when identity
must be checked across sessions; a valid changed UUID alone cannot reveal its past.

Workflow documents use the existing canonical serializer, validator and hash.
Preset/review JSON uses deterministic object-key ordering and SHA-256 checksums;
asset/export hashes cover their bytes. These hashes are corruption checks, not
signatures or protection against an attacker rewriting a consistent entire project.

## Creation and opening

```js
import {
  createProject, openProject, verifyProjectIntegrity,
  exportProjectData, importProjectData,
} from 'whihm-workflow-core';

const created = await createProject(newProjectRoot, {
  title: 'WHIHM campaign', description: 'Local project', tags: ['campaign'], metadata: {},
});
if (created.status !== 'created') return created;
const project = created.project;
const reopened = await openProject(newProjectRoot, { expectedProjectId: created.projectId });
const integrity = await verifyProjectIntegrity(newProjectRoot);
```

Creation requires a new directory; even an existing empty directory is not silently
adopted. Failed creation/copy may leave `.project-incomplete`; such a directory is
never opened as valid. Preserve it for inspection instead of automatically deleting
or recreating it. Opening verifies all registered data, directory declarations, and
history. It is deliberately conservative and not a lazy media-library index.

Successful create/open results include `manifest`, `projectId`, and a `project`
API handle. Handles contain methods; data results are JSON-serializable. Failures
return `rejected` and `diagnostics:[{code,path,message}]` without input secrets or
system paths. Integrity returns `valid` or `invalid`. Busy locks require retry after
the writer finishes, not automatic repair.

## Workflow APIs and history integration

Project-handle APIs:

| Method | Behavior |
| --- | --- |
| `getManifest()` | Return validated current manifest |
| `updateProjectMetadata({title?,description?,tags?,metadata?,mainWorkflowId?})` | Narrow metadata update, no identity/path/version changes |
| `addWorkflowToProject(workflow)` | Validate and register canonical JSON; reject duplicate logical ID |
| `updateWorkflowInProject({workflow,expectedHash})` | Require current registry hash; write new immutable file and update manifest |
| `getProjectWorkflow(workflowId)` | Return detached workflow and canonical hash |
| `listProjectWorkflows()` | Return registered workflow references |
| `removeWorkflowFromProject(workflowId)` | Unregister only if no main-workflow/reference/history dependency |
| `getProjectHistory(workflowId)` | Return existing history store handle and `relativeRoot:'history'` |

The current workflow manifest entry is authoritative for project workflow loading.
Old unregistered workflow files are retained, not silently deleted, and are excluded
from portable copies. Historical snapshots continue to use the separate existing
history format; no second workflow representation or replacement history engine.

History recording and workflow registration are **two explicit commits**, not a
claimed cross-store transaction. Use the existing edit/history APIs, then persist
the matching canonical after-state:

```js
const current = await project.getProjectWorkflow(workflowId);
const historyResult = await project.getProjectHistory(workflowId);
const history = historyResult.store;
const result = applyEditBatch(current.workflow, batch);
const recorded = await history.recordEdit({before:current.workflow, result, batch});
if (recorded.status !== 'recorded') return recorded;
const updated = await project.updateWorkflowInProject({
  workflow: result.workflow, expectedHash: current.hash,
});
```

For a workflow with history, updates must match the latest verified history hash.
Rollback uses `history.rollbackToRecord`, then the same expected-hash project update.
No history entries are automatically fabricated for plain CRUD operations.

If recording succeeds but the project update is interrupted, normal open/integrity
reports `HISTORY_WORKFLOW_STATE_MISMATCH`. Recovery is explicit and non-destructive:
`openProject(root,{reconcileWorkflowId})` allows that one mismatch and returns a warning.
Read the latest canonical after-state with the existing history API using `history/`,
then call the returned project handle's `updateWorkflowInProject`, supplying the old
hash from the manifest. This operation still requires the new workflow to match the
verified history head; it is not force overwrite. All unrelated integrity errors
remain fatal. Transfers refuse a project with unresolved history drift.

A history handle is the original store API, not a sandbox. Use the registered workflow
ID. Creating unregistered workflow histories or historical snapshots with missing
project assets/references is rejected by project integrity checks.

## Assets

`importAsset({sourcePath,assetId?,contentType?,role?,source?,metadata?})` copies one
regular external file without modifying the source. V1 caps imports at **64 MiB**
and uses whole-file reads; streaming/large-media optimization is future work.
No media operations occur. Stored fields:

```text
assetId, path, contentType, role, originalFilename,
checksum (SHA-256), size, source (object), metadata (object)
```

Files receive random collision-resistant names in `assets/`; identity does not
come from a filename. `sourcePath` is never persisted. Source metadata may contain
a safe public URL but not a local original path or credentials. Defaults are
`application/octet-stream` and `generic`. Identical content may have separate IDs
and roles: V1 deliberately does not merge logical asset metadata through deduplication.

`listProjectAssets()`, `getProjectAsset(assetId)`, `resolveProjectAssetPath(assetId)`,
and `removeProjectAsset(assetId)` support lookup and conservative unregistering.
The resolver returns both a relative path and a transient absolute `resolvedPath`.
Removal checks active workflows, project/preset/review/export reference metadata,
and historical workflow snapshots. It never cascades or deletes the physical file.

Workflow local assets must have matching project asset IDs and relative paths.
Optional canonical `{algorithm:'sha256',value:...}` checksums must match. Canonical
safe remote-only references remain allowed, but their remote availability is not
verified or copied by this layer.

Metadata uses core JSON/secret safety checks plus absolute-path rejection. Obvious
credential/key filenames and development/credential directories are refused on
import; recognizable plaintext/JSON secrets are also refused. This is heuristic,
not a claim that arbitrary binary media cannot conceal sensitive data. Users must
select appropriate assets; this is not malware scanning or encrypted-archive inspection.

## Presets, reviews and exports

Preset record: `{presetId,title,type,version,data,metadata}`. `type` is extensible;
`version` is a positive integer. No provider-specific interpretation or execution.

- `addPreset(record)` (ID/metadata may be omitted).
- `updatePreset({preset,expectedHash})` with a complete replacement record.
- `getPreset(presetId)`, `listPresets()`, `removePreset(presetId)`.

Updates write immutable files. Referenced presets cannot be removed, including
references detectable in historical workflow metadata. IDs do not change with titles.

Review record: `{reviewId,workflowId,runId,outputId,assetIds,presetIds,status,notes,
timestamp,metadata}`. IDs, timestamp, empty lists/notes/metadata and nullable references
have defaults. `status` is generic, not a built-in approval state machine.
`addReview(record)`, `getReview(reviewId)`, `listReviews()` provide minimal storage.
Workflow/asset/preset references must exist; run/output IDs are opaque future references
because execution/run storage does not exist yet.

Recognized metadata reference keys are `workflowId`, `assetId`, `assetIds`, `assetRefs`,
`presetId`, `presetIds`, `reviewId`, `exportId`. Arbitrary prose is not inferred as a
reference. Canonical workflow references retain their existing validation rules.

`generateExportPath(extension='bin')` returns a new `exportId`, safe relative path
and transient resolved path. It neither reserves a file nor renders anything.
Future tools must create outputs without overwriting existing files. Once an output
exists, `recordExport({path,exportId?,workflowId?,contentType?,metadata?})` checks the
in-project file and registers its checksum/size/timestamp. `listExports()` returns
metadata. Only registered exports enter a portable copy. Outside paths, missing
files and duplicate output identities/paths are rejected.

## Atomicity and local safety

The write pattern matches history: unique temporary file, flush/close, same-directory
rename; immutable entity files first, atomic manifest update last. Manifest publication
is the registry commit point. Failed writes can leave unregistered files but cannot
make them valid registry entries. Removal unregisters; no garbage collector or physical
delete API is included.

Project writers hold `.project-lock`, then the existing `history/.write-lock` to keep
history stable while validating/publishing project state. Data transfers hold both
source locks. No automatic lock stealing. After an interrupted process, confirm no
writer is alive, preserve a backup and inspect integrity before manually removing an
abandoned lock. Normal read handles can inspect immutable data; opening a new history
handle can report busy while another writer is active.

Directory flushes are attempted, including newly created namespace parents. Windows
may not support directory fsync; native Windows execution has not been tested here.
Atomic rename depends on the local filesystem. Do not remove USB media during writes.
Power-loss guarantees on arbitrary USB/network filesystems are not claimed.

Roots, internal paths and copied files reject symlinks, traversal, absolute Unix/drive/
UNC paths, and excluded development/credential paths. Root parent symlinks are also
refused. This assumes a trusted local filesystem, not a sandbox against a hostile
process racing replacements between checks.

## Directory-based data export/import

```js
await exportProjectData(sourceProjectRoot, newDestinationRoot);
await importProjectData(transferredProjectRoot, anotherNewDestinationRoot);
```

Both perform the same validated directory transfer; no archive dependency is added.
Destination must be absent and separate from the source tree. Source is fully checked
before writing. Only the manifest's registered files plus the existing history store's
committed manifests/records/snapshots are copied. No recursive copy of arbitrary source
contents: caches, `.env`, node_modules, temporary files, orphan snapshots/records and
superseded unregistered JSON files are excluded. Source files remain untouched.

An incomplete destination marker stays in place until copied data passes verification.
The destination is then reopened and verified again. Failed copies preserve their
incomplete destination for inspection and never overwrite a pre-existing destination.
No path rewriting occurs; project ID and workflow IDs survive the transfer. To preserve
unregistered recovery artifacts too, use a separately managed forensic backup, not this
validated project-data export.

Relocation tests create multiple assets, canonical workflow versions and history,
preset, review, and a synthetic output, copy the data, delete the original location,
and verify all components plus history comparison and rollback. Another import verifies
that transfer is repeatable. Asset bytes are harmless temporary text fixtures.

## Integrity and diagnostics

`verifyProjectIntegrity(root,{expectedProjectId?})` checks exact manifest shape/version,
identity, required directories, duplicate IDs, canonical workflows, document hashes,
asset/export hashes and sizes, presets/reviews, reference existence, existing history
integrity, history/current-workflow agreement, and unsafe paths. It returns the first
structured failure; it never repairs data. It does not make remote provider calls.

Core codes include `PROJECT_VERSION_UNSUPPORTED`, `PROJECT_MANIFEST_INVALID`,
`PROJECT_ID_MISMATCH`, `PROJECT_ALREADY_EXISTS`, `PROJECT_NOT_FOUND`,
`PROJECT_PATH_UNSAFE`, `PROJECT_INTEGRITY_FAILED`, `PROJECT_REFERENCE_INVALID`,
`PROJECT_STALE_STATE`, `PROJECT_BUSY`, `PROJECT_WRITE_FAILED`, `PROJECT_IO_FAILED`,
`WORKFLOW_NOT_FOUND`, `WORKFLOW_DUPLICATE`, `WORKFLOW_INVALID`,
`WORKFLOW_REFERENCED_REMOVE_BLOCKED`, `ASSET_NOT_FOUND`, `ASSET_DUPLICATE`,
`ASSET_INVALID`, `ASSET_HASH_MISMATCH`, `ASSET_UNSAFE_CONTENT`,
`ASSET_REFERENCED_REMOVE_BLOCKED`, `PRESET_NOT_FOUND`, `PRESET_DUPLICATE`,
`PRESET_INVALID`, `PRESET_REFERENCED_REMOVE_BLOCKED`, `REVIEW_INVALID`,
`REVIEW_NOT_FOUND`, `REVIEW_DUPLICATE`, `EXPORT_INVALID`, `EXPORT_NOT_FOUND`,
`EXPORT_DUPLICATE`, `EXPORT_HASH_MISMATCH`, `PROJECT_COPY_FAILED`,
`PROJECT_DESTINATION_EXISTS`, `HISTORY_INTEGRITY_FAILED`,
`HISTORY_WORKFLOW_STATE_MISMATCH`.

## Checks

```sh
node --test packages/whihm-workflow-core/tests/project.test.js
npm run test -w whihm-workflow-core
npm run check -w whihm-workflow-core
npm exec --no -- eslint packages/whihm-workflow-core/src packages/whihm-workflow-core/tests
node --test tests/*.test.js
```

This foundation intentionally leaves full project archives, asset management UI,
large-file streaming, execution, review/QC semantics, installed-application packaging,
and credential reconnection to later milestones.
