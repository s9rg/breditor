import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as inputs from '../packages/breditor-collaboration/dist/persistence/actor_lease_input.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {ActorLeaseEscrow} from '../packages/breditor-collaboration/dist/persistence/actor_lease_escrow.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
const code=expected=>error=>error?.code===expected;
test('no factory phase-label hook can release a native actor loan or become public root API',()=>{
 for(const name of ['actorLeaseInputFailed','actorLeaseInputOpened'])assert.equal(Object.hasOwn(inputs,name),false);
 for(const name of ['bindActorLeaseInput','ActorLeaseEscrow','StoppedActorCohort','takeStoppedSharedSourceActors'])assert.equal(Object.hasOwn(api,name),false);
});
test('actual cleanup returns a consumed document and an untaken review slot without a completion phase',async()=>{
 const host=cleanupEnvironment();let originalDocument,originalReview,escrow,token,document,retry;
 try{originalDocument=await SharedWriterLease.acquire('room','101');originalReview=await ReviewWriterLease.acquire('room','comments');escrow=ActorLeaseEscrow.create(originalDocument,originalReview,'room','101','comments');token=inputs.bindActorLeaseInput({},'review','target','room','101','comments',escrow);document=inputs.takeActorDocumentLease(token.input,'review','target','room','101','comments');await assert.rejects(token.rollbackAfterFailure(),code('actor_lease_input_in_use'));assert.equal(host.held.size,2);await document.close();await token.rollbackAfterFailure();escrow.checkIdle('room','101','comments');retry=inputs.bindActorLeaseInput({},'review','retry','room','101','comments',escrow);await retry.rollbackAfterFailure();assert.equal(host.held.size,2);}
 finally{await document?.close();await token?.rollbackAfterFailure();await retry?.rollbackAfterFailure();await escrow?.close();await originalDocument?.close();await originalReview?.close();assert.equal(host.held.size,0);host.restore();}
});
test('canonical private loan liveness ignores a replacement public assertion method',async()=>{
 const host=cleanupEnvironment();let originalDocument,originalReview,escrow,token,document,review;let reads=0;
 try{originalDocument=await SharedWriterLease.acquire('room','101');originalReview=await ReviewWriterLease.acquire('room','comments');escrow=ActorLeaseEscrow.create(originalDocument,originalReview,'room','101','comments');token=inputs.bindActorLeaseInput({},'review','target','room','101','comments',escrow);document=inputs.takeActorDocumentLease(token.input,'review','target','room','101','comments');review=inputs.takeActorReviewLease(token.input,'review','target','room','101','comments');Object.defineProperty(document,'assertLive',{get(){reads++;throw Error('Not actual liveness');}});Object.defineProperty(review,'assertLive',{get(){reads++;throw Error('Not actual liveness');}});await assert.rejects(token.rollbackAfterFailure(),code('actor_lease_input_in_use'));assert.equal(reads,0);await document.close();await review.close();await token.rollbackAfterFailure();assert.equal(reads,0);assert.equal(host.held.size,2);}
 finally{await document?.close();await review?.close();await token?.rollbackAfterFailure();await escrow?.close();await originalDocument?.close();await originalReview?.close();assert.equal(host.held.size,0);host.restore();}
});
