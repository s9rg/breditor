import {resolve} from 'node:path';
/** Actual Rust sessions and canonical constructor release, not a GC timing or
 * memory-size measurement. No room activation or native producer is started. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {waitNativePendingWork as wait} from '../packages/breditor-collaboration/dist/native_pending_work.js';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {nativeProfile,cleanupFamilies,cleanupSession,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
let fixtures;before(async()=>{fixtures=await completeImageNativeFixtures(resolve(new URL('../',import.meta.url).pathname));});after(async()=>{await fixtures?.close();});
for(const family of cleanupFamilies)test('actual '+family+' session retires its pending-work getter on terminal closure',async()=>{const env=cleanupEnvironment(),profile=nativeProfile(fixtures.native);let session;try{
 const selected=cleanupSession(api,profile,{family,database:'pending-release-'+family,actor:'release-'+family}),scope={check(){},watch(){return()=>{};}};session=await selected.open();const alias=session.core;insertCleanupText(alias,'new pending edit');await wait(alias,scope);assert.equal(session.state().status,'saved');await session.close();assert.equal(session.state().status,'closed');await assert.rejects(wait(alias,scope),error=>error.code==='native_pending_work');assert.throws(()=>alias.type('closed alias'));assert.equal(env.held.size,0);
 }finally{await session?.discardAndClose();profile.free();env.restore();}});
