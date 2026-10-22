import { validateWorkflow } from './validate.js';
import { hashWorkflow, diffWorkflows, equalJSON, changedPaths } from './diff.js';
import { validateCommandBatch, readSemanticPath } from './commands/contract.js';
import { applyCommand, CommandFailure } from './commands/apply.js';

function checkPreconditions(doc, conditions, path) {
  for (const [index, condition] of (conditions || []).entries()) {
    const current = readSemanticPath(doc, condition.at);
    if ((Object.hasOwn(condition, 'exists') && current.exists !== condition.exists)
      || (Object.hasOwn(condition, 'equals') && (!current.exists || !equalJSON(current.value, condition.equals)))) {
      throw new CommandFailure('PRECONDITION_FAILED', `${path}/${index}`, 'Expected state does not match; no edit was applied.');
    }
  }
}

export function applyEditBatch(doc, batch) {
  const validation = validateWorkflow(doc);
  const result = { status: 'rejected', beforeHash: null, afterHash: null, commands: null, diff: [], validation, errors: [], warnings: validation.warnings };
  if (!validation.valid) {
    result.errors = [{ code: 'INPUT_WORKFLOW_INVALID', path: '', message: 'Input workflow is invalid.' }, ...validation.errors];
    return result;
  }
  result.beforeHash = hashWorkflow(doc);
  const batchValidation = validateCommandBatch(batch);
  if (!batchValidation.valid) { result.errors = batchValidation.errors; return result; }
  const request = structuredClone(batch);
  result.commands = request.commands;
  if (request.expectedWorkflowHash !== undefined && request.expectedWorkflowHash !== result.beforeHash) {
    result.errors = [{ code: 'WORKFLOW_HASH_MISMATCH', path: '/expectedWorkflowHash', message: 'Workflow state changed; refresh before editing.' }];
    return result;
  }
  const draft = structuredClone(doc);
  let commandIndex = null;
  try {
    checkPreconditions(doc, request.preconditions, '/preconditions');
    for (const [index, command] of request.commands.entries()) {
      commandIndex = index;
      checkPreconditions(draft, command.preconditions, `/commands/${index}/preconditions`);
      applyCommand(draft, command);
    }
  } catch (error) {
    if (!(error instanceof CommandFailure)) throw error;
    result.errors = [{ ...error.diagnostic, commandIndex }];
    return result;
  }
  result.validation = validateWorkflow(draft);
  result.warnings = result.validation.warnings;
  if (!result.validation.valid) {
    result.errors = [{ code: 'RESULTING_WORKFLOW_INVALID', path: '', message: 'Atomic batch rejected by workflow validation.' }, ...result.validation.errors.map(error => ({ ...error, code: error.code === 'MISSING_PORT' ? 'PORT_NOT_FOUND' : error.code }))];
    // Never echo a candidate that turned dynamic command values into secrets.
    if (result.validation.errors.some(e => ['SECRET_MATERIAL', 'SECRET_FIELD', 'UNSAFE_URL'].includes(e.code))) result.commands = null;
    return result;
  }
  result.afterHash = hashWorkflow(draft);
  result.diff = diffWorkflows(doc, draft);
  if (request.allowedPaths !== undefined) {
    const outside = changedPaths(result.diff).filter(path => !request.allowedPaths.some(allowed => path === allowed || path.startsWith(`${allowed}/`)));
    if (outside.length) {
      result.errors = outside.map(path => ({ code: 'COLLATERAL_CHANGE_DETECTED', path, message: 'Change falls outside the allowed scope.' }));
      return result;
    }
  }
  result.status = request.dryRun ? 'dry-run' : 'applied';
  // Dry run intentionally returns no workflow, only prospective hash/diff.
  if (!request.dryRun) result.workflow = draft;
  return result;
}
