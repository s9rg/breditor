import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWriterLease, SharedWriterLeaseEscrow} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease, ReviewWriterLeaseEscrow} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {ActorLeaseEscrow} from '../packages/breditor-collaboration/dist/persistence/actor_lease_escrow.js';

// A TS-private constructor is callable by a JavaScript consumer. Native custody
// must originate in the actual acquired-lock factory, not just a branded object.
for (const [name, Type, args, code] of [
  ['document lease', SharedWriterLease, ['room', '101', () => {}, Promise.resolve()], 'writer_lease_source'],
  ['review lease', ReviewWriterLease, ['room', 'comments', () => {}, Promise.resolve()], 'review_lease_source'],
  ['document escrow', SharedWriterLeaseEscrow, [{}, 'room', '101'], 'writer_escrow_source'],
  ['review escrow', ReviewWriterLeaseEscrow, [{}, 'room', 'comments'], 'review_escrow_source'],
  ['paired escrow', ActorLeaseEscrow, [{}, {}, 'room', '101', 'comments'], 'actor_escrow_source'],
]) {
  test(name + ' rejects direct JS construction before acquiring custody', () => {
    assert.throws(() => Reflect.construct(Type, args), error => error?.code === code);
    assert.throws(() => Reflect.construct(Type, [...args, Object.freeze({})]), error => error?.code === code);
  });
}
