import assert from 'node:assert/strict';
import test from 'node:test';
import {withFixtureCleanup} from './fixtures/fixture-cleanup.mjs';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';

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
