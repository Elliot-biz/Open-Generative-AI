import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject } from 'whihm-workflow-core';
import { audioModels } from '../packages/studio/src/models.js';
import { buildAudioRequest, getAudioExecutionModel, getAudioContractStatus, getAudioMediaInputs } from '../packages/studio/src/audioInputContracts.js';
import { generateAudio } from '../packages/studio/src/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const url = 'https://example.com/source.wav', other = 'https://example.com/other.wav';
const key = 'fixture-only-key';
const speaker = { speaker_id: 'Speaker 1', voice_name: 'Puck', accent: 'Neutral', style: 'Empathetic', pace: 'Natural' };
const gemini = { speakers: [speaker], dialogue_turns: [{ speaker_id: 'Speaker 1', text: '  Hello world  ' }] };
const cases = [
  ['suno-create-music', { style: 'Jazz', model: 'V5', instrumental: false, prompt: 'Lyrics', style_weight: 0.67 }],
  ['suno-remix-music', { audio_url: url, style: 'Jazz', prompt: '  Lyrics  ' }],
  ['suno-extend-music', { audio_url: url, prompt: 'Continue', style: 'Jazz', continue_at: 12 }],
  ['suno-generate-sounds', { prompt: 'Birds in a forest', sound_loop: true, sound_tempo: 120, sound_key: 'C' }],
  ['suno-add-vocals', { audio_url: url, prompt: 'Lyrics', title: 'A song', style: 'Pop' }],
  ['suno-generate-mashup', { audios_list: [other, url], style: 'Funk', instrumental: false, prompt: 'New lyrics' }],
  ['suno-add-instrumental', { audio_url: url, title: 'Track', tags: 'Orchestral' }],
  ['minimax-voice-clone', { audio_url: url, custom_voice_id: 'MyVoice12', prompt: 'Preview', model: 'speech-2.6-hd', accuracy: 0.73, need_noise_reduction: true }],
  ['minimax-speech-2.6-hd', { prompt: 'Speak', voice_id: 'MyVoice12', speed: 1.25, pitch: -3, emotion: 'neutral', format: 'wav', language_boost: 'English' }],
  ['minimax-speech-2.6-turbo', { prompt: 'Speak', voice_id: 'Friendly_Person', speed: 0.75, volume: 1.5, sample_rate: 44100, bitrate: 128000, channel: 2 }],
  ['mmaudio-v2-text-to-audio', { prompt: 'Ocean waves', duration: 12 }],
  ['elevenlabs-text-to-dialogue-v3', { dialogue: [{ text: 'One', voice_id: 'custom-one' }, { text: 'Two', voice_id: 'custom-two' }], stability: 0.75, language_code: 'en' }],
  ['suno-convert-to-wav', { task_id: 'prior-task', audio_id: 'prior-track' }],
  ['gemini-3-1-flash-tts', { ...gemini, temperature: 0.5, scene: 'Quiet room' }],
  ['gemini-2-5-pro-tts', { ...gemini, sample_context: 'Audiobook' }],
  ['elevenlabs-tts-turbo-2-5', { prompt: 'Narrate', voice_id: 'custom-voice', speed: 1.1, stability: 0.3, similarity_boost: 0.8, language_code: 'en' }],
  ['minimax-music-3.0', { prompt: 'Jazz', lyrics: 'Walking through the city', bitrate: 128000, sample_rate: 44100 }],
  ['elevenlabs-v4', { prompt: 'Speak', voice_id: 'voice_liam' }],
  ['fish-s2-1-pro', { prompt: 'Narrate', voice_id: 'voice_fish_narrator' }],
  ['lyria-3-pro', { prompt: 'A long song' }],
  ['lyria-3', { prompt: 'A short song' }],
  ['lyria-2', { prompt: 'Instrumental' }],
];
function workflow(model, parameters) {
  return createWorkflow({ workflowId: 'audio_wave', name: 'Audio', nodes: [{
    id: 'sound', title: 'My independent title', kind: 'audio-generation',
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'audio' } }, parameters: structuredClone(parameters), inputs: [], outputs: [{ id: 'result', type: 'audio' }],
  }] });
}
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (u, init = {}) => {
    calls.push({ url: u, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'audio-job' }
      : { status: 'completed', outputs: ['https://example.com/result.wav'], cost: 0.5, voice_id: 'MyVoice12' } };
  });
  return calls;
}
const request = (model, params) => ({ workflow: workflow(model, params), nodeId: 'sound' });

test('review inventory reuses 23 catalog entries, admits 22, defers Suno multi-step clone', () => {
  assert.equal(audioModels.length, 23); assert.equal(cases.length, 22);
  const before = structuredClone(audioModels);
  for (const [id] of cases) {
    assert.equal(getAudioExecutionModel(id).id, id);
    assert.equal(findRemote(id, 'audio').method, 'generateAudio');
    assert.equal(getAudioContractStatus(id).status, 'REVIEWED');
  }
  assert.equal(getAudioContractStatus('suno-voice-clone').multiStep, true);
  assert.equal(getAudioContractStatus('suno-voice-clone').status, 'DEFERRED');
  assert.equal(findRemote('suno-voice-clone', 'audio'), null);
  assert.equal(getAudioExecutionModel('future-audio'), null);
  assert.throws(() => buildAudioRequest('suno-voice-clone', { audio_url: url }), { code: 'AUDIO_CLONE_LIFECYCLE_UNSUPPORTED' });
  assert.deepEqual(audioModels, before);
});
for (const [id, parameters] of cases) {
  test(`${id}: reviewed shared service preserves provider payload and lifecycle`, async t => {
    const calls = fake(t, true), before = structuredClone(parameters);
    const result = await generateAudio(key, { ...parameters, _modelId: id });
    const contract = buildAudioRequest(id, { ...parameters, _modelId: id });
    assert.equal(calls.length, 2); assert.ok(calls[0].url.endsWith(`/api/v1/${contract.endpoint}`));
    assert.deepEqual(JSON.parse(calls[0].body), contract.payload);
    for (const [field, value] of Object.entries(parameters)) assert.deepEqual(contract.payload[field], value);
    assert.ok(calls[1].url.endsWith('/predictions/audio-job/result'));
    assert.equal(result.request_id, 'audio-job'); assert.equal(result.voice_id, 'MyVoice12');
    assert.deepEqual(parameters, before); assert.equal(Object.hasOwn(contract.payload, '_modelId'), false);
    if (!getAudioExecutionModel(id).inputs.model) assert.equal(Object.hasOwn(contract.payload, 'model'), false);
  });
  test(`${id}: canonical identity, transport-free plan/readiness and authorized execution`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const req = request(id, parameters), before = structuredClone(req.workflow);
    const plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.model, id);
    assert.equal(plan.request.audio.modelId, id); assert.equal(plan.request.audio.multiStep, false);
    assert.equal(plan.request.audio.providerModel, parameters.model ?? getAudioExecutionModel(id).inputs.model?.default ?? null);
    assert.equal(plan.request.method, 'studio.generateAudio'); assert.equal(plan.title, 'My independent title');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    const evidence = await buildWorkflowReadinessContext({ workflow: req.workflow, evaluatedAt: '2026-10-26T12:00:00Z' });
    assert.equal(evidence.provenance.executors.sound.state, 'AVAILABLE');
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    const result = await bridge.execute(req, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.model, id); assert.equal(result.cost, 0.5);
    assert.deepEqual(JSON.parse(calls[0].body), plan.request.audio.providerRequest.payload);
    assert.equal(calls.length, 1); assert.equal(auth, 1); assert.deepEqual(req.workflow, before);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ['suno-remix-music', { style: 'Jazz' }, 'audio_url'],
  ['suno-remix-music', { audio_url: url, style: '  ' }, 'style'],
  ['suno-extend-music', { audio_url: url, style: 'Jazz' }, 'prompt'],
  ['suno-extend-music', { audio_url: url, style: 'Jazz', prompt: 'Go', continue_at: 0 }, 'continue_at'],
  ['suno-extend-music', { audio_url: url, style: 'Jazz', prompt: 'Go', continue_at: 61 }, 'continue_at'],
  ['suno-generate-mashup', { style: 'Jazz' }, 'audios_list'],
  ['suno-generate-mashup', { audios_list: [], style: 'Jazz' }, 'audios_list'],
  ['suno-generate-mashup', { audios_list: Array(3).fill(url), style: 'Jazz' }, 'audios_list'],
  ['suno-generate-mashup', { audios_list: [url, ''], style: 'Jazz' }, 'audios_list[1]'],
  ['suno-generate-mashup', { audios_list: [url], instrumental: false, style: 'Jazz' }, 'prompt'],
  ['suno-generate-mashup', { audios_list: [url] }, 'style'],
  ['suno-remix-music', { audio_url: 'file:///tmp/audio.wav', style: 'Jazz' }, 'audio_url'],
  ['suno-add-vocals', { audio_url: url, title: 'Song', style: 'Pop' }, 'prompt'],
  ['suno-add-vocals', { prompt: 'Lyrics', title: 'Song', style: 'Pop' }, 'audio_url'],
  ['suno-add-instrumental', { audio_url: url }, 'tags'],
  ['suno-generate-sounds', { prompt: 'x'.repeat(501) }, 'prompt'],
  ['suno-generate-sounds', { prompt: 'Sound', duration: 10 }, 'duration'],
  ['mmaudio-v2-text-to-audio', { prompt: 'Waves', duration: 31 }, 'duration'],
  ['minimax-speech-2.6-hd', { prompt: 'Hi', voice_id: 'custom', pitch: 0.5 }, 'pitch'],
  ['minimax-speech-2.6-turbo', { prompt: 'Hi', speed: 2.1 }, 'speed'],
  ['minimax-speech-2.6-hd', { prompt: 'Hi', voice_id: 'custom', emotion: 'invalid' }, 'emotion'],
  ['elevenlabs-tts-turbo-2-5', { prompt: 'Hi', speed: 1.21 }, 'speed'],
  ['elevenlabs-text-to-dialogue-v3', { dialogue: [] }, 'dialogue'],
  ['elevenlabs-text-to-dialogue-v3', { dialogue: [{ text: 'Hi' }] }, 'dialogue[0].voice_id'],
  ['elevenlabs-text-to-dialogue-v3', { dialogue: [{ voice_id: 'custom', text: '' }] }, 'dialogue[0].text'],
  ['elevenlabs-text-to-dialogue-v3', { dialogue: [{ voice_id: 'custom', text: 'Hi', raw: true }] }, 'dialogue[0].raw'],
  ['gemini-3-1-flash-tts', { ...gemini, speakers: [] }, 'speakers'],
  ['gemini-3-1-flash-tts', { ...gemini, speakers: [{ speaker_id: 'Speaker 1' }] }, 'speakers[0].voice_name'],
  ['gemini-3-1-flash-tts', { ...gemini, speakers: [speaker, speaker] }, 'speakers'],
  ['gemini-3-1-flash-tts', { ...gemini, dialogue_turns: [{ speaker_id: 'Speaker 2', text: 'Hi' }] }, 'dialogue_turns'],
  ['gemini-2-5-pro-tts', { ...gemini, speakers: [{ ...speaker, voice_name: 'made-up' }] }, 'speakers[0].voice_name'],
  ['gemini-2-5-pro-tts', { ...gemini, temperature: 2.1 }, 'temperature'],
  ['gemini-3-1-flash-tts', { ...gemini, dialogue_turns: [{ speaker_id: 'Speaker 1', text: 'x'.repeat(10001) }] }, 'dialogue_turns[0].text'],
  ['minimax-voice-clone', { audio_url: url, custom_voice_id: 'MyVoice12' }, 'prompt'],
  ['minimax-voice-clone', { audio_url: url, prompt: 'Hi', custom_voice_id: '12345678' }, 'custom_voice_id'],
  ['suno-convert-to-wav', { audio_url: url, task_id: 'a', audio_id: 'b' }, 'audio_url'],
  ['suno-convert-to-wav', { task_id: 'a' }, 'audio_id'],
  ['suno-create-music', { style: 'Jazz', model: 'lyria-3' }, 'model'],
  ['suno-create-music', { style: 'Jazz', options: { model: 'V5' } }, 'options'],
  ['suno-create-music', { style: 'Jazz', raw: { anything: true } }, 'raw'],
  ['lyria-3', { prompt: 'Music', pitch: 4 }, 'pitch'],
  ['lyria-2', { prompt: 'x'.repeat(2001) }, 'prompt'],
  ['minimax-music-3.0', { prompt: 'Music', lyrics: 'short' }, 'lyrics'],
];
for (const [id, parameters, errorPath] of invalid) test(`${id}: rejects invalid ${errorPath} before auth/transport (${JSON.stringify(parameters).slice(0, 45)})`, async t => {
  const calls = fake(t); let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const req = request(id, parameters), plan = await bridge.plan(req);
  assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].path, errorPath, JSON.stringify(plan));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'rejected');
  await assert.rejects(generateAudio(key, { ...parameters, _modelId: id }), error => error.path === errorPath);
  assert.equal(calls.length, 0); assert.equal(auth, 0);
});

test('identity cannot be overwritten; unknown models and deferred Suno are not canonically admitted', async () => {
  assert.throws(() => buildAudioRequest('lyria-3', { _modelId: 'lyria-2', prompt: 'Hi' }), { code: 'AUDIO_IDENTITY_OVERRIDE' });
  assert.throws(() => buildAudioRequest('lyria-3', { _modelId: 'lyria-3', model: 'lyria-3', prompt: 'Hi' }), { code: 'AUDIO_OPTION_UNSUPPORTED' });
  const bridge = createExecutionBridge();
  for (const id of ['unknown', 'suno-voice-clone']) assert.equal((await bridge.plan(request(id, { audio_url: url }))).status, 'rejected');
  const req = request('lyria-3', { prompt: 'Hi', _modelId: 'lyria-2' });
  assert.equal((await bridge.plan(req)).diagnostics[0].code, 'IDENTITY_OVERRIDE');
});
test('Studio blank optional state, defaults and legacy selected-model form remain supported', async t => {
  const calls = fake(t);
  await generateAudio(key, { _modelId: 'suno-create-music', style: 'Jazz', persona_model: '', persona_id: '', negative_tags: '' });
  assert.equal(JSON.parse(calls[0].body).model, 'V5'); assert.equal(Object.hasOwn(JSON.parse(calls[0].body), 'persona_model'), false);
  await generateAudio(key, { model: 'lyria-2', prompt: 'Music' });
  assert.deepEqual(JSON.parse(calls[1].body), { prompt: 'Music' });
  const minimized = buildAudioRequest('gemini-3-1-flash-tts', { _modelId: 'gemini-3-1-flash-tts', ...gemini, speakers: [{ speaker_id: 'Speaker 1', voice_name: 'Puck' }] });
  assert.equal(minimized.payload.speakers[0].accent, 'Neutral');
});
test('unreviewed application audio remains on existing generic path, not falsely certified', async t => {
  const calls = fake(t);
  await generateAudio(key, { _modelId: 'suno-voice-clone', audio_url: url, language: 'en' });
  assert.deepEqual(JSON.parse(calls[0].body), { audio_url: url, language: 'en' });
  assert.equal(getAudioContractStatus('suno-voice-clone').status, 'DEFERRED');
  await generateAudio(key, { _modelId: 'future-application-audio', custom: 3 });
  assert.deepEqual(JSON.parse(calls[1].body), { custom: 3 });
});

test('ordered project audio arrays reuse integrity resolution/uploads and preserve relative canonical data', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-audio-')), root = path.join(directory, 'project');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { project } = await createProject(root, { title: 'Audio' });
  for (const id of ['one', 'two']) {
    const sourcePath = path.join(directory, `${id}.wav`); await fs.writeFile(sourcePath, id);
    assert.equal((await project.importAsset({ sourcePath, assetId: id, contentType: 'audio/wav' })).status, 'imported');
  }
  const registry = (await project.listProjectAssets()).assets;
  const w = workflow('suno-generate-mashup', { style: 'Jazz' });
  w.assets = registry.map(a => ({ id: a.assetId, type: 'audio', localPath: a.path }));
  w.nodes[0].inputs = [{ id: 'audios_list', type: 'audio', required: true }]; w.nodes[0].assetRefs = ['one', 'two'];
  assert.equal((await project.addWorkflowToProject(w)).status, 'added');
  const before = JSON.stringify(w), manifest = JSON.stringify((await project.getManifest()).manifest), calls = fake(t), uploads = [];
  const runtime = createApplicationRuntime({ getApiKey: () => key });
  runtime.upload = async a => { uploads.push(a.assetId); return `https://example.com/${a.assetId}.wav`; };
  runtime.canUpload = () => true;
  const bridge = createExecutionBridge({ runtime }), req = { workflow: w, nodeId: 'sound', project, assetBindings: { audios_list: ['two', 'one'] } };
  const plan = await bridge.plan(req);
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.deepEqual(plan.requiredUploads.map(x => x.assetId), ['two', 'one']);
  assert.equal(plan.request.requiredMedia[0].ordered, true); assert.equal(plan.request.requiredMedia[0].maximum, 2);
  assert.ok(!JSON.stringify(plan).includes(root)); assert.equal(calls.length, 0); assert.equal(uploads.length, 0);
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(uploads, ['two', 'one']); assert.deepEqual(JSON.parse(calls[0].body).audios_list, ['https://example.com/two.wav', 'https://example.com/one.wav']);
  assert.equal(JSON.stringify(w), before); assert.equal(JSON.stringify((await project.getManifest()).manifest), manifest);
  const duplicate = await bridge.plan({ ...req, assetBindings: { audios_list: ['one', 'one'] } });
  assert.equal(duplicate.status, 'planned');
  assert.equal((await bridge.plan({ ...req, assetBindings: { audios_list: [] } })).status, 'rejected');
  assert.equal((await bridge.plan({ ...req, assetBindings: { audios_list: ['missing'] } })).status, 'rejected');
  assert.equal((await bridge.plan({ ...req, assetBindings: { audios_list: 'one' } })).status, 'rejected');
  assert.equal((await bridge.plan({ ...req, assetBindings: { style: ['one'] } })).status, 'rejected');
  const conflict = structuredClone(w); conflict.nodes[0].parameters.audios_list = [url];
  assert.equal((await bridge.plan({ ...req, workflow: conflict })).status, 'rejected');
  await fs.writeFile(path.join(root, registry[0].path), 'corrupted');
  assert.equal((await bridge.plan(req)).status, 'rejected'); assert.equal(calls.length, 1);
});

test('credential-bearing media URLs reject at contract and canonical safety boundaries', async t => {
  const calls = fake(t), parameters = { audio_url: 'https://user:pass@example.com/audio', style: 'Jazz' };
  assert.throws(() => buildAudioRequest('suno-remix-music', parameters), { code: 'AUDIO_MEDIA_INVALID' });
  await assert.rejects(generateAudio(key, { ...parameters, _modelId: 'suno-remix-music' }), { code: 'AUDIO_MEDIA_INVALID' });
  const req = request('suno-remix-music', { audio_url: url, style: 'Jazz' });
  req.workflow.nodes[0].parameters = parameters;
  assert.equal((await createExecutionBridge().plan(req)).diagnostics[0].code, 'WORKFLOW_INVALID');
  assert.equal(calls.length, 0);
});
