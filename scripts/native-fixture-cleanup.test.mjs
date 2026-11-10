import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {withFixtureCleanup} from './fixtures/fixture-cleanup.mjs';
import {startNativeGenerationCompleteControls} from './fixtures/generation-recovery-control/complete-native-host.mjs';
import {startNativeGenerationControls} from './fixtures/generation-recovery-control/native-host.mjs';
import {prepareColdJointSources} from './fixtures/local-metadata/cold-joint-sources.mjs';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {startNativeCompleteControls} from './fixtures/physical-recovery-control/complete-native-host.mjs';
import {startNativePhysicalControls} from './fixtures/physical-recovery-control/native-host.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';

for (const [name, start] of Object.entries({
 'physical': startNativePhysicalControls,
 'complete physical': startNativeCompleteControls,
 'generation': startNativeGenerationControls,
 'complete generation': startNativeGenerationCompleteControls,
})) {
 test(`missing executable rejects ${name} fixture startup`, {timeout: 3000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'breditor-missing-native-fixture-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  await assert.rejects(
   start(directory, join(directory, 'missing-fixture'), directory),
   /Native (physical|generation(?:-complete)?)-control fixture did not prepare/,
  );
 });
}

test('a failed native fixture retains the operation and lock errors and still stops the host', async () => {
 const descriptors = ['indexedDB', 'navigator', 'Image'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
 const restore = environment();
 const operation = Error('Native fixture operation failed');
 let enter, release;
 const entered = new Promise(resolve => { enter = resolve; });
 const held = new Promise(resolve => { release = resolve; });
 const lock = navigator.locks.request('fixture-writer', () => { enter(); return held; });
 let stopped = false;
 try {
  await assert.rejects(withFixtureCleanup(async () => {
   await entered;
   throw operation;
  }, restore, async () => {
   for (const [name, descriptor] of descriptors) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), descriptor);
   }
   release();
   await lock;
   stopped = true;
  }), error => {
   assert.ok(error instanceof AggregateError);
   assert.equal(error.cause, operation);
   assert.equal(error.errors.length, 2);
   assert.equal(error.errors[0], operation);
   assert.match(error.errors[1].message, /Every borrowed recovery\/native writer lock must be released/);
   return true;
  });
  assert.equal(stopped, true);
 } finally {
  release();
  await lock;
 }
});

test('clean teardown preserves the result or original failure', async () => {
 const value = {};
 const operation = Error('operation');
 const teardown = Error('teardown');
 assert.equal(await withFixtureCleanup(() => value, async () => {}), value);
 await assert.rejects(withFixtureCleanup(() => { throw operation; }, async () => {}), error => error === operation);
 await assert.rejects(withFixtureCleanup(() => value, async () => { throw teardown; }), error => error === teardown);
});

test('failed metadata fixture setup restores the process globals and stops the host', async () => {
 const descriptors = ['fetch', 'WebSocket'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
 const setup = Error('Metadata fixture authentication failed');
 let stopCalls = 0;
 await assert.rejects(testMetadataMaterialization('remote-content', {
  nativeHostFactory() {
   return {
    initial: {},
    fixture: () => ({inventoryJson: '{}', clients: [{principal: 'alice'}]}),
    authentication() { throw setup; },
    stop() { stopCalls++; },
   };
  },
 }), error => error === setup);
 assert.equal(stopCalls, 1);
 for (const [name, descriptor] of descriptors) {
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), descriptor);
 }
});


test('failed joint replacement preparation restores the prior image decoder', async t => {
 const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
 t.after(() => {
  if (original) Object.defineProperty(globalThis, 'Image', original);
  else delete globalThis.Image;
 });
 const before = {configurable: true, enumerable: true, writable: true, value: class PriorFixtureImage {}};
 Object.defineProperty(globalThis, 'Image', before);
 const replacement = Error('Fixture replacement preparation failed');
 const clients = () => Array.from({length: 7}, (_, id) => ({
  id,
  core: {
   select() {},
   type() {},
   dispatchReview() {},
   captureReviewAnchor: () => '{}',
   checkpointJson: () => 'offline document ' + id,
   documentJson: () => 'document ' + id,
   reviewHistoryPolicy: () => 'original',
   reviewCheckpoint: () => 'offline review ' + id,
   segmentedHistoryPolicy: () => undefined,
  },
 }));
 const session = {
  f: {oldCalls: 0},
  owner: {
   clients: clients(),
   assets(id) {
    return {async get() { return id < 3 ? {status: 'uploaded', storageRef: 'fixture-receipt-' + id} : undefined; }};
   },
  },
  async cold(_current, {checkAuthority}) {
   checkAuthority();
   this.owner.clients = clients();
  },
 };
 await assert.rejects(prepareColdJointSources({
  session,
  bundle: {metadata: {file: new Blob(['{}'])}, parent: {current: {}}},
  requests: [],
  readCacheCalls: () => 0,
  async prepareReplacement() {
   assert.notEqual(globalThis.Image, before.value);
   throw replacement;
  },
  borrow() { assert.fail('Preparation failed before the room could be borrowed'); },
 }), error => error === replacement);
 assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'Image'), before);
});
