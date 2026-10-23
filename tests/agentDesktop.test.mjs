import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAgentNavigation, parseAgentRoute } from '../src/lib/agent-desktop/routes.mjs';
import { workflowDesktopCompatibility } from '../src/lib/workflow-desktop/vite.mjs';
import {
  getTemplateAgents, getUserAgents, getPublishedAgents, getUserConversations,
  getAgentBySlug, getAgentConversation, sendAgentChatMessage,
  pollAgentChatResult, createAgent,
} from '../packages/studio/src/muapi.js';

test('agent list, selection, conversation, create view, and return are local route state', () => {
  const router = createAgentNavigation();
  assert.deepEqual(router.getSnapshot().params.tab, ['agents']);
  router.push('/agents/brand-helper');
  assert.deepEqual(router.getSnapshot().params.tab, ['agents', 'brand-helper']);
  router.push('/agents/brand-helper/conversation-7');
  assert.deepEqual(router.getSnapshot().params.tab, ['agents', 'brand-helper', 'conversation-7']);
  router.replace('/agents/create', { scroll: false });
  assert.deepEqual(router.getSnapshot().params.tab, ['agents', 'create']);
  router.back();
  assert.deepEqual(router.getSnapshot().params.tab, ['agents', 'brand-helper']);
  router.push('/agents');
  assert.deepEqual(router.getSnapshot().params.tab, ['agents']);
  assert.deepEqual(parseAgentRoute('/agents/edit/agent-1').params.tab, ['agents', 'edit', 'agent-1']);
  for (const route of ['file:///etc/passwd', '/agents/../secret', '/workflow/a', '/agents/agent/nope/extra']) {
    assert.throws(() => parseAgentRoute(route), /Unsupported/);
  }
});

test('Vite aliases only the upstream Agent Studio routing hook', () => {
  const plugin = workflowDesktopCompatibility();
  const agent = fileURLToPath(new URL('../packages/studio/src/components/AgentStudio.jsx', import.meta.url));
  const workflow = fileURLToPath(new URL('../packages/studio/src/components/WorkflowUI.jsx', import.meta.url));
  const app = fileURLToPath(new URL('../src/lib/muapi.js', import.meta.url));
  assert.match(plugin.resolveId('next/navigation', agent), /agent-desktop\/navigation\.jsx$/);
  assert.match(plugin.resolveId('next/navigation', workflow), /workflow-desktop\/navigation\.jsx$/);
  assert.equal(plugin.resolveId('next/navigation', app), undefined);
});

test('existing MuAPI agent services preserve key auth, route selection, and request/poll lifecycle', async () => {
  const calls = [];
  const responses = [
    [{ id: 'template-1' }], [{ id: 'owned-1' }], [{ id: 'featured-1' }], [{ id: 'conversation-1' }],
    { agent_id: 'brand-helper', name: 'Brand Helper' },
    { id: 'conversation-1', history: [{ role: 'user', content: 'Earlier' }] },
    { request_id: 'request-42' },
    { is_complete: true, conversation_id: 'conversation-2', messages: [{ role: 'assistant', content: 'Mock answer' }] },
    { agent_id: 'created-1' },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const data = responses[calls.length - 1];
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  };
  try {
    const key = 'fake-agent-test-key';
    await getTemplateAgents(key);
    await getUserAgents(key);
    await getPublishedAgents(key);
    await getUserConversations(key);
    await getAgentBySlug(key, 'brand-helper');
    await getAgentConversation(key, 'brand-helper', 'conversation-1');
    const submitted = await sendAgentChatMessage(key, 'brand-helper', { message: 'Hello', conversationId: 'conversation-1' });
    const completed = await pollAgentChatResult(key, submitted.request_id, { maxAttempts: 1, interval: 0 });
    await createAgent(key, { name: 'Draft', system_prompt: 'Mock only', skill_ids: [] });

    assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
      '/agents/templates/agents', '/agents/user/agents', '/agents/featured/agents',
      '/agents/user/conversations', '/agents/by-slug/brand-helper',
      '/agents/by-slug/brand-helper/conversation-1', '/agents/by-slug/brand-helper/chat',
      '/api/v1/predictions/request-42/result', '/agents',
    ]);
    assert.ok(calls.every(call => call.options.headers['x-api-key'] === key));
    assert.equal(JSON.parse(calls[6].options.body).conversation_id, 'conversation-1');
    assert.equal(JSON.parse(calls[6].options.body).stream, false);
    assert.equal(completed.messages[0].content, 'Mock answer');
    assert.deepEqual(JSON.parse(calls[8].options.body), { name: 'Draft', system_prompt: 'Mock only', skill_ids: [] });
    assert.ok(calls.every(call => !String(call.options.body || '').includes(key)));
    assert.ok(calls.every(call => call.options.headers['x-api-key'] === key), 'The existing API key is used only for remote request authentication');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
