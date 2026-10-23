/** Non-consuming read laws. Kernel witnesses are explicit test doubles; the
 * local-family case separately uses actual native/IDB/upload parent custody. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {reserveIndependentLocalRead} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {fixture} from './delivery-operation-cohort.test.mjs';
import {reserveDeliveryOperationRead} from '../packages/breditor-collaboration/dist/delivery_operation_cohort/read.js';
import './fixtures/operation-read/kernel-laws.mjs';

test('a genuine local read keeps parent and upload leases, bytes and native work unchanged',async()=>{
 const f=await fixture();const row=f.rows.find(row=>row.family==='independent-local');let read;
 try{
  const before=row.parent.readableSource();assert.throws(()=>reserveIndependentLocalRead([{ready:true}]));
  read=reserveIndependentLocalRead([row.parent]);await assert.rejects(row.parent.check());await read.prepare();const value=read.states[0];assert.equal(value.source.session.exportRecovery().identity.native.writer,before.identity.native.writer);
  assert.deepEqual(Buffer.from(await(await value.uploads.exportBackup()).arrayBuffer()),row.uploads);
  for(let i=0;i<2;i++){await read.verify();read.checkCurrent();await assert.rejects(RecoveryLease.acquire(JSON.stringify(row.options.database)),error=>error.code==='recovery_in_use');await assert.rejects(row.parent.intoParts());}
  assert.deepEqual(row.parent.readableSource(),before);read.close();read=undefined;await f.retryable();assert.deepEqual(row.parent.readableSource(),before);await f.take();
 }finally{read?.close();await f.close();}
});
test('five-family read keeps every parent lease and upload owner through repeated inspection',async()=>{
 const f=await fixture();let read;
 try{
  const rows=f.rows.map(row=>({id:row.id,family:row.family,operation:row.parent}));
  for(const values of [[],Array(2),[{...rows[0],operation:{ready:true}}],[rows[0],{...rows[1],operation:rows[0].operation}],[rows[0],{...rows[1],id:rows[0].id}]]){assert.throws(()=>reserveDeliveryOperationRead(values));await f.retryable();}
  read=reserveDeliveryOperationRead(rows);await read.prepare();assert.deepEqual(read.states.map(row=>[row.id,row.family]),rows.map(row=>[row.id,row.family]));
  for(let cycle=0;cycle<2;cycle++){
   await read.verify();read.checkCurrent();
   for(const [index,member]of read.states.entries()){
    const original=f.rows[index];assert.deepEqual(Buffer.from(await(await member.parts.uploads.exportBackup()).arrayBuffer()),original.uploads);
    await assert.rejects(RecoveryLease.acquire(JSON.stringify(original.options.cohort?.parentDatabase??original.options.database)),error=>error.code==='recovery_in_use');await assert.rejects(original.parent.intoParts());assert.deepEqual(original.parent.readableSource(),original.before);
   }
  }
  read.close();read=undefined;await f.retryable();for(const row of f.rows)assert.deepEqual(row.parent.readableSource(),row.before);await f.take();
 }finally{read?.close();await f.close();}
});
