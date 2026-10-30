/** Reproduce the complete parent callback, not only the child source check. */
import test from 'node:test';import assert from 'node:assert/strict';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {families,nativeVersionSession} from './fixtures/native-version-delivery/session.mjs';
import {originalNativeRetention} from '../packages/breditor-collaboration/dist/operation_read/native_retention.js';
import {nativeDeliverySource} from '../packages/breditor-collaboration/dist/operation_read/delivery_retention.js';
import {checkManagedRecoveryOwners} from '../packages/breditor-collaboration/dist/participant_recovery/components.js';
import {checkRetainedRecoveryOwners} from '../packages/breditor-collaboration/dist/participant_recovery/retained_owners.js';
import {createNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createNativeVersionDelivery} from '../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
test('original recovery parent remains retained during its own genuine native version loan',{timeout:120000},async()=>nativeVersionSession({family:families[0],wire:2},async f=>{
 const uploads=await RichAssetStore.open('original-parent-version-loan-uploads'),owners={session:f.session,uploads,versions:f.catalog},retained=originalNativeRetention({core:f.session.core,session:f.session,versions:f.catalog},()=>{checkRetainedRecoveryOwners(owners);},f.session),source=nativeDeliverySource(retained);
 let context;
 try{
  source.check();context=createNativeRelayDelivery({native:f.held,session:f.session,core:f.session.core,reviewCeiling:'comment',checkAuthority:()=>{source.check();}});
  f.versions=createNativeVersionDelivery(f.catalog,context,f.options);source.check();
  assert.throws(()=>checkManagedRecoveryOwners(owners),error=>error.code==='version_recovery_in_use','Ordinary recovery handoff semantics must remain unchanged');
  await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();await f.versions.connect();await f.versions.flushShared();source.check();assert.ok(f.catalog.versionStatus(f.named.id).accepted);
  await f.versions.close();await context.close();await f.finishAndCold();assert.throws(()=>source.check());
 }catch(error){console.log('ORIGINAL_PARENT_VERSION_RETENTION_FAILURE '+JSON.stringify(internalFailureChain(error).map(value=>({code:value.code,message:value.message}))));throw error;}
 finally{await context?.close();uploads.close();}
}));
