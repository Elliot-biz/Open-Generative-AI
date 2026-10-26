import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject } from 'whihm-workflow-core';
import { buildSunoCloneRequest, getSunoCloneModel } from '../packages/studio/src/sunoCloneInputContracts.js';
import { runSunoVoiceClone } from '../packages/studio/src/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';
const sample = 'https://example.com/sample.wav', recording = 'https://example.com/fresh.wav';
const phrase = '  Fresh phrase — Écoutez EXACTLY!  ';
const requestId = 'clone-request_123';
const waiting = { status: 'processing', output: { stage: 'awaiting_phrase', phrase } };
const complete = { status: 'completed', output: { stage: 'completed', voice_id: 'voice_real_123' } };
const initial = { model: 'suno-voice-clone', action: 'start', audio_url: sample };
function mock(t, responses) {
  const calls = [], timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (cb, _delay, ...args) => timer(cb, 0, ...args));
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); const next = responses.shift(); assert.ok(next, 'unexpected provider transport');
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => next };
  });
  return calls;
}
function workflow(parameters) {
  return createWorkflow({ workflowId: 'guided_clone', name: 'Guided Clone', nodes: [{ id: 'clone', title: 'Clone own singing voice', kind: 'generation',
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model: 'suno-voice-clone', mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'voice_clone_guided' } }, parameters, inputs: [], outputs: [{ id: 'identity', type: 'json' }] }] });
}
function bridge() {
  let credentials = 0;
  const runtime = createApplicationRuntime({ getApiKey: () => { credentials++; return 'fixture-key'; } });
  return { runtime, bridge: createExecutionBridge({ runtime }), credentials: () => credentials };
}
async function start(t, raw = waiting) {
  const calls = mock(t, [{ request_id: requestId }, raw]);
  const result = await runSunoVoiceClone('fixture', initial);
  return { calls, result, state: result.operationState };
}
const declaredState = { capability: 'CLONE_VOICE_GUIDED', modelId: 'suno-voice-clone', requestId, continuationId: 'state_fixture', stage: 'awaiting_phrase', phrase,
  sourceSample: { reference: sample }, voiceId: null, phase: 'AWAITING_PHRASE_RECORDING', nextAction: 'confirm', userActionRequired: true };

test('exact guided binding is separate from 22 ordinary audio contracts and MiniMax', () => {
  assert.equal(getSunoCloneModel('suno-voice-clone').endpoint, 'suno-voice-clone');
  assert.equal(findRemote('suno-voice-clone', 'voice_clone_guided').method, 'runSunoVoiceClone');
  assert.equal(findRemote('suno-voice-clone', 'audio'), null);
  assert.equal(findRemote('minimax-voice-clone', 'audio').method, 'generateAudio');
  assert.equal(findRemote('minimax-voice-clone', 'voice_clone_guided'), null);
});
test('start exact supported controls/defaults; plain plan/readiness are transport and credential free', async t => {
  const calls = mock(t, []), f = bridge();
  const parameters = { action: 'start', audio_url: sample, language: 'fr', vocal_start_s: 2, vocal_end_s: 12, voice_name: 'My voice', style: 'Pop', description: 'Own voice' };
  const plan = await f.bridge.plan({ workflow: workflow(parameters), nodeId: 'clone' });
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.request.sunoClone.capability, 'CLONE_VOICE_GUIDED');
  assert.equal(plan.request.sunoClone.userConfirmationRequired, true);
  const { action: _action, ...wire } = parameters; assert.deepEqual(plan.request.sunoClone.providerRequest.payload, wire);
  const evidence = await buildWorkflowReadinessContext({ workflow: workflow(parameters), evaluatedAt: '2026-10-26T20:00:00Z' });
  assert.equal(evidence.provenance.executors.clone.state, 'AVAILABLE');
  assert.equal(calls.length, 0); assert.equal(f.credentials(), 0);
});
test('START stops at exact fresh provider phrase; no automatic confirmation or audio artifact', async t => {
  const { calls, result, state } = await start(t);
  assert.equal(result.status, 'awaiting_user'); assert.equal(state.stage, 'awaiting_phrase'); assert.equal(state.phrase, phrase);
  assert.equal(state.userActionRequired, true); assert.equal(state.nextAction, 'confirm'); assert.equal(state.requestId, requestId);
  assert.equal(state.voiceId, null); assert.equal(calls.length, 2); assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(JSON.parse(calls[0].body).language, 'en'); assert.equal(JSON.parse(calls[0].body).vocal_end_s, 10);
  assert.ok(calls[1].url.endsWith(`/predictions/${requestId}/result`));
});
test('CONFIRM revalidates provider challenge then posts distinct human recording; completion preserves voice identity', async t => {
  const responses = [{ request_id: requestId }, waiting, waiting, {}, { status: 'completed', output: { stage: 'generating' } }, complete];
  const calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', initial);
  const result = await runSunoVoiceClone('fixture', { model: initial.model, action: 'confirm', state: first.operationState, audio_url: recording, recording_origin: 'user_recorded_challenge' });
  assert.equal(result.status, 'succeeded'); assert.equal(result.operationState.voiceId, 'voice_real_123'); assert.equal(result.operationState.stage, 'completed');
  assert.equal(result.operationState.requestId, requestId); assert.equal(result.operationState.nextAction, null);
  assert.deepEqual(JSON.parse(calls[3].body), { audio_url: recording });
  assert.ok(calls[3].url.endsWith(`/suno-voice-clone/${requestId}/confirm`));
  assert.equal(calls.filter(c => c.method === 'POST').length, 2); assert.equal(responses.length, 0);
  assert.ok(!calls.some(c => /speech|tts|create-music/.test(c.url)));
});
for (const [label, raw, status] of [
  ['failed', { status: 'failed', output: { stage: 'failed' }, error: 'fixture failure' }, 'failed'],
  ['unknown', { status: 'processing', output: { stage: 'provider-new-stage' } }, 'blocked'],
  ['missing voice id', { status: 'completed', output: { stage: 'completed' } }, 'blocked'],
  ['missing phrase', { status: 'processing', output: { stage: 'awaiting_phrase' } }, 'blocked'],
  ['completed', complete, 'succeeded'],
]) test(`provider ${label}: explicit state without false success or invented artifacts`, async t => {
  const { result } = await start(t, raw); assert.equal(result.status, status);
  assert.equal(result.operationState.stage, raw.output.stage);
  assert.equal(result.operationState.voiceId, status === 'succeeded' ? 'voice_real_123' : null);
  assert.equal(Object.hasOwn(result, 'url'), false); assert.deepEqual(result.upstream.output, raw.output); assert.equal(result.upstream.status, raw.status);
});
test('poll resumes the same waiting request, without POST or automatic restart', async t => {
  const responses = [{ request_id: requestId }, waiting, waiting], calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', initial);
  const next = await runSunoVoiceClone('fixture', { model: initial.model, action: 'poll', state: first.operationState });
  assert.equal(next.status, 'awaiting_user'); assert.equal(next.operationState.phrase, phrase);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
test('lost/forged continuation is blocked before any provider transport, never restarted', async t => {
  const calls = mock(t, []);
  for (const action of ['poll', 'confirm']) await assert.rejects(runSunoVoiceClone('fixture', { model: initial.model, action, state: declaredState,
    ...(action === 'confirm' ? { audio_url: recording, recording_origin: 'user_recorded_challenge' } : {}) }), e => e.code === 'SUNO_CLONE_CONTINUATION_UNAVAILABLE');
  assert.equal(calls.length, 0);
});
test('provider challenge drift blocks confirmation POST', async t => {
  const responses = [{ request_id: requestId }, waiting, { output: { stage: 'awaiting_phrase', phrase: 'different' } }], calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', initial);
  await assert.rejects(runSunoVoiceClone('fixture', { model: initial.model, action: 'confirm', state: first.operationState, audio_url: recording, recording_origin: 'user_recorded_challenge' }), e => e.code === 'SUNO_CLONE_PROVIDER_CHALLENGE_CHANGED');
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});
test('confirmation cannot be replayed even when provider still says awaiting phrase', async t => {
  const responses = [{ request_id: requestId }, waiting, waiting, waiting], calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', initial);
  const args = { model: initial.model, action: 'confirm', state: first.operationState, audio_url: recording, recording_origin: 'user_recorded_challenge' };
  const next = await runSunoVoiceClone('fixture', args);
  assert.equal(next.status, 'blocked'); assert.equal(next.operationState.nextAction, 'poll'); assert.equal(next.operationState.userActionRequired, false);
  await assert.rejects(runSunoVoiceClone('fixture', args), e => e.code === 'SUNO_CLONE_CONTINUATION_BLOCKED');
  assert.equal(calls.filter(c => c.method === 'POST').length, 2);
});
const invalid = [
  { action: 'start' }, { action: 'start', audio_url: '/tmp/private.wav' }, { action: 'start', audio_url: 'file:///a' },
  { action: 'start', audio_url: sample, language: 'xx' }, { action: 'start', audio_url: sample, vocal_start_s: -1 },
  { action: 'start', audio_url: sample, vocal_end_s: 61 }, { action: 'start', audio_url: sample, vocal_start_s: 10, vocal_end_s: 10 },
  { action: 'start', audio_url: sample, vocal_start_s: 1.5 }, { action: 'start', audio_url: sample, provider_options: {} },
  { action: 'start', audio_url: sample, model: 'other' }, { action: 'start', audio_url: sample, state: declaredState },
  { action: 'start', audio_url: sample, raw: {} }, { action: 'bogus' },
  { action: 'confirm', audio_url: recording, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: { ...declaredState, requestId: '../unsafe' }, audio_url: recording, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: { ...declaredState, stage: 'generating' }, audio_url: recording, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: { ...declaredState, phrase: '' }, audio_url: recording, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: declaredState, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: declaredState, audio_url: sample, recording_origin: 'user_recorded_challenge' },
  { action: 'confirm', state: declaredState, audio_url: recording, recording_origin: 'tts' },
  { action: 'confirm', state: declaredState, audio_url: recording },
  { action: 'confirm', state: declaredState, audio_url: recording, recording_origin: 'user_recorded_challenge', language: 'en' },
  { action: 'poll' }, { action: 'poll', state: { ...declaredState, sourceSample: { reference: '/tmp/no' } } },
];
for (const [index, parameters] of invalid.entries()) test(`invalid guided request ${index} rejects before credentials/transport`, async t => {
  const calls = mock(t, []), f = bridge();
  const w = workflow({}); w.nodes[0].parameters = parameters;
  assert.equal((await f.bridge.plan({ workflow: w, nodeId: 'clone' })).status, 'rejected');
  assert.equal((await f.bridge.execute({ workflow: w, nodeId: 'clone' }, { allowExecution: true })).status, 'rejected');
  assert.equal(f.credentials(), 0); assert.equal(calls.length, 0);
  assert.throws(() => buildSunoCloneRequest({ model: initial.model, ...parameters }));
});
async function projectFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'suno-guided-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'project'), { project } = await createProject(root, { title: 'Guided clone' });
  const assets = [];
  for (const [assetId, bytes] of [['initial', 'initial voice sample'], ['confirmation', 'fresh recorded challenge'], ['duplicate', 'initial voice sample'], ['wrong', 'image bytes']]) {
    const sourcePath = path.join(directory, assetId); await fs.writeFile(sourcePath, bytes);
    const imported = await project.importAsset({ sourcePath, assetId, contentType: assetId === 'wrong' ? 'image/png' : 'audio/wav' });
    assets.push({ id: assetId, type: assetId === 'wrong' ? 'image' : 'audio', localPath: imported.asset.path });
  }
  const w = workflow({ action: 'start' }); w.assets = assets;
  w.nodes[0].inputs = [{ id: 'audio_url', type: 'audio' }]; w.nodes[0].assetRefs = assets.map(a => a.id);
  return { root, project, w, assets };
}
test('canonical project start/confirm preserve logical state, distinct checksums, separate authorization and no fake audio outputs', async t => {
  const p = await projectFixture(t), f = bridge(), responses = [{ request_id: requestId }, waiting, waiting, {}, complete], calls = mock(t, responses), uploads = [];
  f.runtime.canUpload = () => true; f.runtime.upload = async asset => { uploads.push(asset.assetId); return asset.assetId === 'initial' ? sample : recording; };
  const req = { workflow: p.w, nodeId: 'clone', project: p.project, assetBindings: { audio_url: 'initial' } };
  assert.equal((await f.bridge.plan({ ...req, assetBindings: { audio_url: 'wrong' } })).status, 'rejected');
  let plan = await f.bridge.plan(req); assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(calls.length, 0); assert.equal(uploads.length, 0);
  assert.ok(!JSON.stringify(plan).includes(p.root)); assert.equal(plan.resolvedInputs.audio_url, 'https://project-asset.invalid/initial');
  assert.equal((await f.bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
  const first = await f.bridge.execute(req, { allowExecution: true });
  assert.equal(first.status, 'awaiting_user', JSON.stringify(first)); assert.deepEqual(first.outputs, []);
  assert.equal(first.operationState.sourceSample.reference, 'https://project-asset.invalid/initial'); assert.match(first.operationState.sourceSample.checksum, /^[a-f0-9]{64}$/);
  p.w.nodes[0].parameters = { action: 'confirm', state: first.operationState, recording_origin: 'user_recorded_challenge' };
  const confirm = { ...req, assetBindings: { audio_url: 'confirmation' } };
  const before = calls.length; plan = await f.bridge.plan(confirm);
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(calls.length, before); assert.equal(uploads.length, 1);
  assert.equal(plan.request.sunoClone.providerRequest.endpoint, `suno-voice-clone/${requestId}/confirm`);
  assert.ok(!JSON.stringify(plan).includes(p.root));
  for (const assetId of ['initial', 'duplicate', 'wrong']) assert.equal((await f.bridge.plan({ ...confirm, assetBindings: { audio_url: assetId } })).status, 'rejected');
  assert.equal((await f.bridge.execute(confirm)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
  const result = await f.bridge.execute(confirm, { allowExecution: true });
  assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.deepEqual(result.outputs, []);
  assert.equal(result.operationState.voiceId, 'voice_real_123'); assert.equal(result.resultKind, 'provider-voice-identity');
  assert.deepEqual(uploads, ['initial', 'confirmation']); assert.equal(calls.length, 5);
  await fs.writeFile(path.join(p.root, p.assets.find(a => a.id === 'confirmation').localPath), 'corrupt');
  assert.equal((await f.bridge.plan(confirm)).status, 'rejected');
});
test('canonical confirm requires a registered human recording, not just a URL/WHIHM approval', async t => {
  const calls = mock(t, []), f = bridge(), params = { action: 'confirm', state: declaredState, audio_url: recording, recording_origin: 'user_recorded_challenge' };
  assert.equal((await f.bridge.execute({ workflow: workflow(params), nodeId: 'clone' }, { allowExecution: true })).diagnostics[0].code, 'SUNO_CLONE_REGISTERED_RECORDING_REQUIRED');
  assert.equal(calls.length, 0); assert.equal(f.credentials(), 0);
});
test('interrupted confirmation POST returns poll-only state and never retries/restarts', async t => {
  const responses = [{ request_id: requestId }, waiting, waiting, new Error('uncertain POST'), waiting], calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', initial);
  const confirmed = await runSunoVoiceClone('fixture', { model: initial.model, action: 'confirm', state: first.operationState, audio_url: recording, recording_origin: 'user_recorded_challenge' });
  assert.equal(confirmed.status, 'blocked'); assert.equal(confirmed.operationState.nextAction, 'poll');
  const resumed = await runSunoVoiceClone('fixture', { model: initial.model, action: 'poll', state: confirmed.operationState });
  assert.equal(resumed.status, 'blocked'); assert.equal(resumed.operationState.nextAction, 'poll');
  assert.equal(calls.filter(c => c.method === 'POST').length, 2);
});
test('mutating returned state cannot rewrite session source identity or provider challenge', async t => {
  const responses = [{ request_id: requestId }, waiting], calls = mock(t, responses);
  const first = await runSunoVoiceClone('fixture', { ...initial, _sampleIdentity: { reference: sample, checksum: 'a'.repeat(64) } });
  first.operationState.sourceSample = { reference: recording, checksum: 'b'.repeat(64) };
  await assert.rejects(runSunoVoiceClone('fixture', { model: initial.model, action: 'confirm', state: first.operationState, audio_url: 'https://example.com/relabel.wav',
    _sampleIdentity: { reference: 'https://example.com/relabel.wav', checksum: 'a'.repeat(64) }, recording_origin: 'user_recorded_challenge' }), e => e.code === 'SUNO_CLONE_DISTINCT_RECORDING_REQUIRED');
  first.operationState.phrase = 'invented';
  await assert.rejects(runSunoVoiceClone('fixture', { model: initial.model, action: 'confirm', state: first.operationState, audio_url: 'https://example.com/relabel.wav', recording_origin: 'user_recorded_challenge' }), e => e.code === 'SUNO_CLONE_CONTINUATION_BLOCKED');
  assert.equal(calls.length, 2);
});
test('opaque provider voice identity is preserved, never treated as a media path or asset', async t => {
  const { result } = await start(t, { status: 'completed', output: { stage: 'completed', voice_id: 'voice:Opaque-Case_123' } });
  assert.equal(result.status, 'succeeded'); assert.equal(result.operationState.voiceId, 'voice:Opaque-Case_123');
});
test('forged canonical continuation rejects before upload or provider GET/POST', async t => {
  const p = await projectFixture(t), f = bridge(), calls = mock(t, []); let uploads = 0;
  f.runtime.canUpload = () => true; f.runtime.upload = async () => { uploads++; return recording; };
  p.w.nodes[0].parameters = { action: 'confirm', state: declaredState, recording_origin: 'user_recorded_challenge' };
  const result = await f.bridge.execute({ workflow: p.w, nodeId: 'clone', project: p.project, assetBindings: { audio_url: 'confirmation' } }, { allowExecution: true });
  assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, 'SUNO_CLONE_CONTINUATION_UNAVAILABLE'); assert.equal(uploads, 0); assert.equal(calls.length, 0);
});
test('concurrent confirmations cannot both submit after asynchronous provider checks', async t => {
  const calls = []; let gets = 0, posts = 0, release;
  const gate = new Promise(resolve => { release = resolve; }), timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (cb, _delay, ...args) => timer(cb, 0, ...args));
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    if (init.method === 'POST') { posts++; return { ok: true, json: async () => posts === 1 ? { request_id: requestId } : complete }; }
    gets++;
    if (gets > 1) { if (gets === 3) release(); await gate; }
    return { ok: true, json: async () => waiting };
  });
  const first = await runSunoVoiceClone('fixture', initial);
  const args = { model: initial.model, action: 'confirm', state: first.operationState, audio_url: recording, recording_origin: 'user_recorded_challenge' };
  const results = await Promise.allSettled([runSunoVoiceClone('fixture', args), runSunoVoiceClone('fixture', args)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 'succeeded').length, 1, JSON.stringify(results.map(r => r.status === 'fulfilled' ? r.value : { code: r.reason.code, message: r.reason.message })));
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(calls.filter(c => c.url.endsWith('/confirm')).length, 1);
});
for (const internal of [{ _validateOnly: true }, { _sampleIdentity: { reference: sample } }]) test(`canonical caller cannot inject internal ${Object.keys(internal)[0]}`, async t => {
  const calls = mock(t, []), f = bridge();
  const plan = await f.bridge.plan({ workflow: workflow({ action: 'start', audio_url: sample, ...internal }), nodeId: 'clone' });
  assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].code, 'IDENTITY_OVERRIDE');
  assert.equal(f.credentials(), 0); assert.equal(calls.length, 0);
});
test('canonical normalization rejects malformed one-shot success without a completed reusable voice identity', async () => {
  const f = bridge(); f.runtime.remote = async () => ({ status: 'succeeded', request_id: requestId, operationState: { ...declaredState, stage: 'completed', voiceId: null } });
  const result = await f.bridge.execute({ workflow: workflow({ action: 'start', audio_url: sample }), nodeId: 'clone' }, { allowExecution: true });
  assert.notEqual(result.status, 'succeeded'); assert.equal(result.diagnostics[0].code, 'SUNO_CLONE_RESULT_INVALID');
});
