/** Explicit read policy is snapshotted before any callback or native factory. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {localPortableReadPolicy} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_policy.js';
import {captureLocalOperationBackup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {prepareLocalPortableCase} from './fixtures/independent-local-operation/portable.mjs';
const runtime=process.env.BREDITOR_LOCAL_PORTABLE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
test('invalid falsy signals do not silently select an absent read signal',async()=>{
 const f=await host.fixture();let calls=0;try{const options={session:f.options.recovery.session,checkAuthority(){calls++;}};for(const signal of [null,false,0,'',{}])assert.throws(()=>localPortableReadPolicy(f.selection,{...options,signal}));assert.equal(calls,0);}finally{await f.close();}
});
test('invalid falsy limits do not silently select the default budget',async()=>{
 const f=await host.fixture();let calls=0;try{const options={session:f.options.recovery.session,checkAuthority(){calls++;}};for(const limits of [null,false,0,'',[],()=>{}])assert.throws(()=>localPortableReadPolicy(f.selection,{...options,limits}));assert.equal(calls,0);}finally{await f.close();}
});
test('invalid optional resolvers refuse before authority rather than being ignored by local hits',async()=>{
 const value=await prepareLocalPortableCase(await host.fixture(),captureLocalOperationBackup,{stage:'initial'});let calls=0;try{for(const resolveAsset of [null,false,0,'',{}])await assert.rejects(value.capture({resolveAsset,checkAuthority(){calls++;}}));assert.equal(calls,0);}finally{await value.close();}
});
