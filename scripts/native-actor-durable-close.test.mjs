/** Resource-level durable-close laws under controlled Web Locks. These do not
 * claim physical browser durability or authenticated whole-room publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as documentLeases from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import * as reviewLeases from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {pairHeldActorLeases} from '../packages/breditor-collaboration/dist/persistence/actor_lease_escrow.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
const code=expected=>error=>error?.code===expected;
const modes=[{kind:'document',module:documentLeases,name:'SharedWriterLease',id:'101',prefix:'writer',busy:'writer_in_use'},{kind:'comment',module:reviewLeases,name:'ReviewWriterLease',id:'comments',prefix:'review',busy:'review_writer_in_use'}];
for(const m of modes){
 const Type=m.module[m.name],Plan=m.module[m.name+'CloseRetention'],prepare=m.module['prepare'+m.name+'CloseRetention'],check=m.module['check'+m.name+'CloseRetention'],take=m.module['take'+m.name+'CloseRetention'],cancel=m.module['cancel'+m.name+'CloseRetention'],move=m.module['create'+m.name+'Escrow'];
 test(m.kind+' remains live for final save; only its real Close captures custody with no release or reacquisition',async()=>{
  const host=cleanupEnvironment();let old,escrow,loan;
  try{old=await Type.acquire('room',m.id);const plan=prepare(old,'room',m.id);old.assertLive();assert.equal(host.held.size,1);assert.throws(()=>check(plan),code(m.prefix+'_retention_incomplete'));assert.throws(()=>take(plan),code(m.prefix+'_retention_incomplete'));await assert.rejects(Type.acquire('room',m.id),code(m.busy));
   assert.throws(()=>move(old,'room',m.id),code(m.prefix+'_lease_retaining'));old.assertLive();await old.close();assert.throws(()=>old.assertLive(),code(m.prefix+'_lease_closed'));check(plan);await old.close();assert.equal(host.held.size,1);await assert.rejects(Type.acquire('room',m.id),code(m.busy));
   escrow=take(plan);assert.throws(()=>take(plan),code(m.prefix+'_retention_incomplete'));assert.throws(()=>cancel(plan),code(m.prefix+'_retention_state'));loan=escrow.borrow('room',m.id);loan.assertLive();await loan.close();assert.equal(host.held.size,1);await escrow.close();assert.equal(host.held.size,0);
  }finally{await loan?.close();await escrow?.close();await old?.close();host.restore();}
 });
 test(m.kind+' duplicate preparation refuses; cancelling a pending transfer restores ordinary final release',async()=>{
  const host=cleanupEnvironment();let old;
  try{old=await Type.acquire('room',m.id);const plan=prepare(old,'room',m.id);assert.throws(()=>prepare(old,'room',m.id),code(m.prefix+'_lease_retaining'));old.assertLive();cancel(plan);old.assertLive();assert.throws(()=>cancel(plan),code(m.prefix+'_retention_state'));assert.throws(()=>take(plan),code(m.prefix+'_retention_incomplete'));await old.close();assert.equal(host.held.size,0);
  }finally{await old?.close();host.restore();}
 });
 test(m.kind+' identity and forged plan refusal cannot move or close an original actor',async()=>{
  const host=cleanupEnvironment();let old,escrow;let reads=0;
  try{old=await Type.acquire('room',m.id);assert.throws(()=>prepare(old,'other',m.id),code(m.prefix+'_lease_identity'));old.assertLive();const fake=Object.create(Plan.prototype);Object.defineProperty(fake,'captured',{get(){reads++;return true;}});for(const action of[check,take,cancel])assert.throws(()=>action(fake),code(m.prefix+'_retention_source'));assert.equal(reads,0);assert.throws(()=>new Plan(old,'room',m.id,{}),code(m.prefix+'_retention_source'));
   const plan=prepare(old,'room',m.id);await old.close();escrow=take(plan);assert.equal(host.held.size,1);
  }finally{await escrow?.close();await old?.close();assert.equal(host.held.size,0);host.restore();}
 });
 test(m.kind+' a staged borrower cannot install a deferred close transfer',async()=>{
  const host=cleanupEnvironment();let old,escrow,loan;
  try{old=await Type.acquire('room',m.id);escrow=move(old,'room',m.id);loan=escrow.borrow('room',m.id);assert.throws(()=>prepare(loan,'room',m.id),code(m.prefix+'_lease_borrowed'));loan.assertLive();await loan.close();assert.equal(host.held.size,1);
  }finally{await loan?.close();await escrow?.close();await old?.close();assert.equal(host.held.size,0);host.restore();}
 });
}
test('partial paired shutdown retains captured document and still-live comment until actual retry closes both',async()=>{
 const host=cleanupEnvironment();let document,review,pair;
 try{document=await documentLeases.SharedWriterLease.acquire('room','101');review=await reviewLeases.ReviewWriterLease.acquire('room','comments');const doc=documentLeases.prepareSharedWriterLeaseCloseRetention(document,'room','101'),comment=reviewLeases.prepareReviewWriterLeaseCloseRetention(review,'room','comments');
  await document.close();documentLeases.checkSharedWriterLeaseCloseRetention(doc);review.assertLive();assert.throws(()=>reviewLeases.checkReviewWriterLeaseCloseRetention(comment),code('review_retention_incomplete'));assert.equal(host.held.size,2);
  await assert.rejects(documentLeases.SharedWriterLease.acquire('room','101'),code('writer_in_use'));await assert.rejects(reviewLeases.ReviewWriterLease.acquire('room','comments'),code('review_writer_in_use'));
  // A save failure before comment Close leaves that original actor live. The
  // retry uses the same handles; it never reacquires either writer.
  review.assertLive();await review.close();documentLeases.checkSharedWriterLeaseCloseRetention(doc);reviewLeases.checkReviewWriterLeaseCloseRetention(comment);
  pair=pairHeldActorLeases(documentLeases.takeSharedWriterLeaseCloseRetention(doc),reviewLeases.takeReviewWriterLeaseCloseRetention(comment),'room','101','comments');pair.checkIdle('room','101','comments');await document.close();await review.close();assert.equal(host.held.size,2);await pair.close();assert.equal(host.held.size,0);
 }finally{await pair?.close();await document?.close();await review?.close();host.restore();}
});
