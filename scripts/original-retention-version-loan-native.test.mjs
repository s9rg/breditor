/** Fast genuine-source regression for a catalog lending work through a
 * context that checks that same retained source. No detached source mock. */
import test from 'node:test';import assert from 'node:assert/strict';
import {families,nativeVersionSession} from './fixtures/native-version-delivery/session.mjs';
import {originalNativeRetention} from '../packages/breditor-collaboration/dist/operation_read/native_retention.js';
import {nativeDeliverySource} from '../packages/breditor-collaboration/dist/operation_read/delivery_retention.js';
import {createNativeRelayDelivery} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createNativeVersionDelivery} from '../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
import {checkManagedSource} from '../packages/breditor-collaboration/dist/managed_custody.js';
import {checkRetainedVersionCatalog} from '../packages/breditor-collaboration/dist/versions/retained_source.js';
test('original retained source remains live throughout its genuine native version loan',{timeout:120000},async()=>nativeVersionSession({family:families[0],wire:2},async f=>{
 const retained=originalNativeRetention({core:f.session.core,session:f.session,versions:f.catalog},()=>{},f.session),source=nativeDeliverySource(retained);
 let context;
 try{
  source.check();
  context=createNativeRelayDelivery({native:f.held,session:f.session,core:f.session.core,reviewCeiling:'comment',checkAuthority:()=>{source.check();}});
  f.versions=createNativeVersionDelivery(f.catalog,context,f.options);
  source.check();assert.throws(()=>f.catalog.saveVersion('Ordinary editing stays blocked','9'));
  assert.throws(()=>checkManagedSource(f.catalog,f.session.core),error=>error.code==='version_recovery_in_use');
  assert.throws(()=>checkRetainedVersionCatalog({...f.catalog},f.session.core),error=>error.code==='managed_source_unavailable');
  await f.doc.connect();await f.doc.flush();await f.review.connect();await f.review.flush();
  await f.versions.connect();await f.versions.flushShared();source.check();assert.ok(f.catalog.versionStatus(f.named.id).accepted);
  await f.versions.close();source.check();
  await context.close();await f.finishAndCold();assert.throws(()=>source.check(),'Cold startup cannot revive the old retained source');
 }catch(error){console.log('ORIGINAL_VERSION_RETENTION_FAILURE '+JSON.stringify(internalFailureChain(error).map(value=>({code:value.code,message:value.message}))));throw error;}
 finally{await context?.close();}
}));
