/** Actual five-family parents must retain cleanup if publication fails after
 * the genuine native capture has opened. Controlled native/storage faults. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {freshDeliveryFixture,freshDeliveryFamilies,freshDeliveryReserve} from './fixtures/original-operational-read/fresh_delivery_session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {LocalOperationReferenceCapture} from '../packages/breditor-collaboration/dist/independent_local_operation/reference_capture.js';
import {IndependentOperationReferenceCapture} from '../packages/breditor-collaboration/dist/independent_operation/reference_capture.js';
import {RestoredGraphReferenceCapture} from '../packages/breditor-collaboration/dist/restored_graph/reference_capture.js';
import {LocalInputReferenceCapture} from '../packages/breditor-collaboration/dist/native_input_operation/reference_capture.js';
const captures={'independent-local':LocalOperationReferenceCapture,'independent-delivery':IndependentOperationReferenceCapture,'restored-graph':RestoredGraphReferenceCapture,'local-operation-snapshot':LocalInputReferenceCapture,'local-operation-flat':LocalInputReferenceCapture},seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
for(const family of freshDeliveryFamilies)test(family+' retains unpublished capture cleanup before unlocking its genuine parent',async()=>{
 const f=await freshDeliveryFixture({profile,seed,tag:'fresh-unpublished-cleanup-'+sequence++,family}),prototype=captures[family].prototype,metadata=prototype.metadata,dispose=prototype.dispose,captured=new Set();let attempts=0,read;
 try{const stored=await snapshotReadDatabases(),before=JSON.stringify(f.owner.readableSource());prototype.metadata=function(){captured.add(this);throw Error('Publication refused after actual native capture opened');};prototype.dispose=function(){captured.add(this);if(++attempts<3)throw undefined;return dispose.call(this);};read=freshDeliveryReserve[family](f.owner,f.readOptions,()=>{});await assert.rejects(read.prepare());assert.equal(captured.size,1);assert.equal(attempts,1);prototype.metadata=metadata;
  let failed=false;try{read.close();}catch(error){failed=true;assert.equal(error,undefined);}assert.equal(failed,true,'failed unpublished capture cleanup must stay owned for a real retry');assert.equal(attempts,2);await assert.rejects(f.owner.check(),'parent must stay reserved while actual child cleanup fails');assert.deepEqual(await snapshotReadDatabases(),stored);read.close();assert.equal(attempts,3);await f.owner.check();assert.equal(JSON.stringify(f.owner.readableSource()),before);assert.deepEqual(await snapshotReadDatabases(),stored);
  const parts=await f.take(),core=parts.source.session.core,document=core.documentJson();assert.equal(core.undo(),true);assert.equal(core.redo(),true);assert.equal(core.documentJson(),document);assert.equal(core.undoReview().kind,'committed');assert.equal(core.redoReview().kind,'committed');
 }finally{prototype.metadata=metadata;prototype.dispose=dispose;for(const value of captured)dispose.call(value);read?.close();await f.close();}
});
