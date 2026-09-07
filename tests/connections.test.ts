import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Connections } from '../packages/local-server/src/connections.ts';

void test('pairing requires page acknowledgement, isolates instances and expires without changing sessions', () => {
  let now = Date.now();
  const connections = new Connections(() => now);
  const scope = { appId: 'another-app', workspaceId: randomUUID() };
  const session = { provider: 'codex', sessionId: randomUUID() };
  const invitation = connections.create({ ...scope, session });
  assert.equal(invitation.state, 'waiting-page');
  invitation.session!.sessionId = 'mutated-client-copy';
  assert.deepEqual(connections.get(invitation.code).session, session);
  const instanceId = randomUUID();
  const receipt = connections.accept(invitation.code, instanceId, null);
  assert.equal(receipt.state, 'connected');
  assert.equal(receipt.instanceId, instanceId);
  assert.deepEqual(connections.accept(invitation.code, instanceId, session).session, session);
  assert.throws(() => connections.accept(invitation.code, randomUUID(), session), /another page/);
  assert.throws(
    () => connections.connect(invitation.code, { ...session, sessionId: randomUUID() }, null),
    /claimed/,
  );
  now += 90_001;
  assert.equal(connections.get(invitation.code).state, 'expired');
  assert.throws(() => connections.accept(invitation.code, instanceId, session), /ended/);
});

void test('existing-page pairing uses an explicit previous session and rejects changed bindings', () => {
  const connections = new Connections();
  const scope = { appId: 'video-editor', workspaceId: randomUUID(), instanceId: randomUUID() };
  const previousSession = { provider: 'codex', sessionId: randomUUID() };
  const session = { provider: 'codex', sessionId: randomUUID() };
  const offer = connections.create({ ...scope, previousSession });
  assert.equal(offer.state, 'waiting-agent');
  assert.throws(
    () => connections.accept(offer.code, scope.instanceId, previousSession),
    /not connected/,
  );
  assert.throws(() => connections.connect(offer.code, session, null), /another session/);
  assert.equal(connections.connect(offer.code, session, previousSession).state, 'waiting-page');
  assert.throws(() => connections.accept(offer.code, scope.instanceId, null), /changed/);
  assert.equal(
    connections.accept(offer.code, scope.instanceId, previousSession).state,
    'connected',
  );
  assert.throws(() => connections.disconnect(offer.code, randomUUID()), /another page/);
  assert.equal(connections.disconnect(offer.code, scope.instanceId).state, 'disconnected');
  assert.throws(() => connections.connect(offer.code, session, previousSession), /ended/);
});
