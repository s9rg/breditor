/** Genuine input/source/whole-upload ownership and cold resume. Controlled fixtures,
 * not next-generation export, authenticated room activation or physical durability. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{pathToFileURL}from'node:url';
import{IDBDatabase}from'fake-indexeddb';
import * as api from'../packages/breditor-collaboration/dist/index.js';import * as rich from'@breditor/experimental-rich-content';
import{OperationalIndependentDeliveryParticipant as OldParticipant}from'../packages/breditor-collaboration/dist/independent_operation/participant.js';
import{captureIndependentOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import{IndependentOperationBackup as Snapshot}from'../packages/breditor-collaboration/dist/independent_operation/portable_backup.js';
import{IndependentOperationLineageBackup as Lineage}from'../packages/breditor-collaboration/dist/independent_operation/lineage_archive.js';
import{RestoredOperationParticipant as Participant}from'../packages/breditor-collaboration/dist/restored_participant/participant.js';
import{restoredOperationJournalBinding as sourceBinding}from'../packages/breditor-collaboration/dist/restored_operation/journal.js';
import{openRestoredOperationSource}from'../packages/breditor-collaboration/dist/restored_operation/open_source.js';
import{independentDeliverySource}from'../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import{environment}from'./fixtures/room-participant-inventory/environment.mjs';import{nativeProfile,insertCleanupText}from'./fixtures/owned-core-cleanup/session.mjs';import{portableFixture}from'./fixtures/independent-operation/portable.mjs';import{recoveryFactory}from'./fixtures/independent-delivery-recovery/session.mjs';import{recoveryFaults,databaseValues,change,unknownDatabase}from'./fixtures/independent-delivery-recovery/storage.mjs';import{pixelAsset,secondAsset,secondPixel}from'./fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_RESTORED_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')),bytes=async b=>Buffer.from(await b.arrayBuffer());let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
async function fixture(selection={},mode='pending'){
 const reset=environment(),faults=recoveryFaults();let f,input;
 try{f=await portableFixture({api,rich,Participant:OldParticipant,profile,seed,tag:'restored-participant-'+sequence++,selection});await f.uploads.flush(async r=>'retained-upload/'+r.asset);
  if(mode!=='unchanged'){insertCleanupText(f.source.core,'Acknowledged CURRENT ');await f.source.flush();faults.select(f.options.sourceDatabase,'operation_history_heads',1,'abort');
   if(mode==='packet-only'){const proposal=f.queues.queue.propose('Pending-only image','9',{scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset:secondAsset,generation:'pending-only-image'}}]}});await assert.rejects(f.queues.queue.flush());faults.clear();f.queues.queue.stopRetryingPublication(proposal.id);f.queues.queue.forget(proposal.id);}
   else{insertCleanupText(f.source.core,'Pending exact commit ');await assert.rejects(f.source.flush());faults.clear();insertCleanupText(f.source.core,'Newer offline LIVE ');}f.setWrite(false);await assert.rejects(f.source.flush());
  }
  const captured=await capture({source:f.source,assets:f.uploads,...f.readOptions});assert.equal(captured.kind,'ready');input=captured.backup;const live=input.liveSource(),uploadFile=input.uploadBackup();await f.source.discardAndClose();
  const options={kind:'snapshot-v1',expected:input.selection(),database:f.options.sourceDatabase+'-parent',journalDatabase:f.options.sourceDatabase+'-restored-journal',sourceDatabase:f.options.sourceDatabase+'-restored-source',uploadsDatabase:f.options.sourceDatabase+'-restored-uploads',writerRecovery:'host-reacquired',session:recoveryFactory(f.selected.options,{readOnly:false,access:'moderate'}),checkAuthority(){}};
  return{...f,input,live,uploadFile,options,faults,async close(){faults.clear();input?.dispose();await f.close();faults.restore();reset();}};
 }catch(e){faults.clear();input?.dispose();await f?.close();faults.restore();reset();throw e;}
}
async function closeParts(parts){await parts?.source.session.discardAndClose();parts?.uploads.close();}
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test(`whole participant holds exact uploads with native source and cold descendants, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented});let owner,parts,cold,alias;
 try{owner=await Participant.begin(f.input.file(),f.options);assert.equal('RestoredOperationParticipant'in api,false);assert.deepEqual(await owner.progress(),{uploads:'reserved',source:'reserved',phase:'preparing'});assert.deepEqual(await bytes(owner.file()),await bytes(f.input.file()));await owner.finish();await owner.check();assert.deepEqual(owner.readableSource(),f.live);alias=await rich.RichAssetStore.openRetained(f.options.uploadsDatabase);await assert.rejects(alias.retry(secondAsset),e=>e.code==='asset_custody_busy');await assert.rejects(Promise.resolve().then(()=>alias.flush(async()=>{throw Error('must not upload');})),e=>e.code==='asset_custody_busy');assert.deepEqual(await bytes(await alias.exportBackup()),await bytes(f.uploadFile));
  parts=await owner.intoParts();assert.throws(()=>owner.file());assert.deepEqual(await bytes(await parts.uploads.exportBackup()),await bytes(f.uploadFile));assert.equal((await parts.uploads.get(pixelAsset)).status,'uploaded');assert.equal((await parts.uploads.get(secondAsset)).status,'cancelled');assert.equal((await parts.uploads.get(pixelAsset)).storageRef,'retained-upload/'+pixelAsset);insertCleanupText(parts.source.session.core,'Editable after parent handoff ');await parts.source.session.flush();await parts.uploads.retry(secondAsset);const saved=independentDeliverySource(parts.source.session).read(),uploads=await bytes(await parts.uploads.exportBackup()),incoming=await bytes(sourceBinding(independentDeliverySource(parts.source.session).operation).inputFile());await closeParts(parts);parts=undefined;
  cold=await Participant.resume(f.options);await cold.finish();assert.deepEqual(cold.readableSource(),saved);parts=await cold.intoParts();assert.deepEqual(await bytes(await parts.uploads.exportBackup()),uploads);assert.deepEqual(await bytes(sourceBinding(independentDeliverySource(parts.source.session).operation).inputFile()),incoming);assert.equal((await parts.uploads.get(secondAsset)).status,'pending');assert.throws(()=>parts.source.session.exportRecovery(),e=>e.code==='independent_operation_export_required');
 }finally{await closeParts(parts);await owner?.discardAndClose();await cold?.discardAndClose();alias?.close();await f.close();}
});
test('packet-only pending image is replayed then forgotten LIVE survives, while whole input keeps pixels',async()=>{
 const f=await fixture({},'packet-only');let owner,parts,read;
 try{assert.ok(f.input.pendingCut());assert.match(f.input.pendingCut().head,/pending-only-image/);assert.equal(JSON.stringify(f.live.retained).includes('pending-only-image'),false);owner=await Participant.begin(f.input.file(),f.options);await owner.finish();assert.deepEqual(owner.readableSource(),f.live);parts=await owner.intoParts();const file=sourceBinding(independentDeliverySource(parts.source.session).operation).inputFile();read=await Snapshot.read(file,f.input.selection(),f.readOptions);assert.deepEqual(await bytes(read.blob(secondAsset,'pending-only-image')),Buffer.from(secondPixel));assert.match(read.pendingCut().head,/pending-only-image/);assert.equal(JSON.stringify(independentDeliverySource(parts.source.session).read().retained).includes('pending-only-image'),false);}
 finally{read?.dispose();await closeParts(parts);await owner?.discardAndClose();await f.close();}
});
test('unchanged native states collapse to one acknowledgement, with whole upload receipts intact',async()=>{
 const f=await fixture({},'unchanged');let owner,parts;
 try{owner=await Participant.begin(f.input.file(),f.options);await owner.finish();parts=await owner.intoParts();const b=sourceBinding(independentDeliverySource(parts.source.session).operation);assert.deepEqual(await b.progress(),{completed:1,total:1,ready:true,pending:false});assert.deepEqual(await bytes(await parts.uploads.exportBackup()),await bytes(f.uploadFile));await closeParts(parts);parts=undefined;owner=await Participant.resume(f.options);await owner.finish();assert.deepEqual(owner.readableSource(),f.live);}
 finally{await closeParts(parts);await owner?.discardAndClose();await f.close();}
});
for(const boundary of['uploads-start','uploads-import','uploads-complete','source-start','source-write','source-complete'])for(const kind of['abort','lost-ack'])test(`cold parent resumes exact components, ${boundary}, ${kind}`,async()=>{
 const f=await fixture();let owner,parts;
 try{owner=await Participant.begin(f.input.file(),f.options);const lane=boundary==='uploads-import'?{database:f.options.uploadsDatabase,store:'assets',number:1}:boundary==='source-write'?{database:f.options.sourceDatabase,store:'restored_operation_history_heads',number:2}:{database:f.options.database,store:'restored_participant_state',number:{'uploads-start':1,'uploads-complete':2,'source-start':3,'source-complete':4}[boundary]};f.faults.select(lane.database,lane.store,lane.number,kind);await assert.rejects(owner.finish());f.faults.clear();await owner.discardAndClose();owner=await Participant.resume(f.options);await owner.finish();assert.deepEqual(owner.readableSource(),f.live);parts=await owner.intoParts();assert.deepEqual(await bytes(await parts.uploads.exportBackup()),await bytes(f.uploadFile));}
 finally{f.faults.clear();await closeParts(parts);await owner?.discardAndClose();await f.close();}
});
test('flat lineage input remains exact after parent retirement and source handoff',async()=>{
 const f=await fixture({},'unchanged');let graph,owner,parts;
 try{graph=await Lineage.append(f.input,f.input,f.readOptions);const incoming=await bytes(graph.file()),options={...f.options,kind:'lineage-v1',expected:graph.selection()};owner=await Participant.begin(graph.file(),options);await owner.finish();graph.dispose();f.input.dispose();parts=await owner.intoParts();const b=sourceBinding(independentDeliverySource(parts.source.session).operation);assert.deepEqual(await bytes(b.inputFile()),incoming);assert.deepEqual(b.readSource(parts.source.session),f.live);}
 finally{await closeParts(parts);await owner?.discardAndClose();graph?.dispose();await f.close();}
});
test('a source journal cannot be adopted by another parent or whole-upload namespace',async()=>{
 const f=await fixture();let owner,other,parts;
 try{owner=await Participant.begin(f.input.file(),f.options);await owner.finish();parts=await owner.intoParts();await closeParts(parts);parts=undefined;const before=await databaseValues(f.options.sourceDatabase),uploads=await databaseValues(f.options.uploadsDatabase);other=await Participant.begin(f.input.file(),{...f.options,database:f.options.database+'-different',uploadsDatabase:f.options.uploadsDatabase+'-different'});await assert.rejects(other.finish());assert.deepEqual(await databaseValues(f.options.sourceDatabase),before);assert.deepEqual(await databaseValues(f.options.uploadsDatabase),uploads);}
 finally{await closeParts(parts);await other?.discardAndClose();await owner?.discardAndClose();await f.close();}
});
test('standalone restored source profile cannot silently become a coordinated source',async()=>{
 const f=await fixture();let source,owner;
 try{const{database,journalDatabase,sourceDatabase,uploadsDatabase,...base}=f.options;source=await openRestoredOperationSource({...base,database:journalDatabase,sourceDatabase},f.input.file());await source.source.close();source=undefined;const before=await databaseValues(sourceDatabase);owner=await Participant.begin(f.input.file(),f.options);await assert.rejects(owner.finish());assert.deepEqual(await databaseValues(sourceDatabase),before);}
 finally{await source?.source.discardAndClose();await owner?.discardAndClose();await f.close();}
});
for(const component of['uploads','journal','source'])test(`completed missing ${component} refuses without reconstructing or overwriting`,async()=>{
 const f=await fixture();let owner;
 try{owner=await Participant.begin(f.input.file(),f.options);await owner.finish();await owner.discardAndClose();owner=undefined;const name=component==='uploads'?f.options.uploadsDatabase:component==='journal'?f.options.journalDatabase:f.options.sourceDatabase;await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=resolve;q.onerror=()=>reject(q.error);});owner=await Participant.resume(f.options);await assert.rejects(owner.finish());assert.equal((await indexedDB.databases()).some(r=>r.name===name),false);}
 finally{await owner?.discardAndClose();await f.close();}
});
test('foreign parent and whole-upload namespaces retain their actual data',async()=>{
 const f=await fixture();let owner,foreign;
 try{await unknownDatabase(f.options.database);const parent=await databaseValues(f.options.database);await assert.rejects(Participant.begin(f.input.file(),f.options));assert.deepEqual(await databaseValues(f.options.database),parent);const options={...f.options,database:f.options.database+'-fresh'};foreign=await rich.RichAssetStore.open(options.uploadsDatabase);await foreign.ingest(new Blob([secondPixel],{type:'image/png'}));const before=await bytes(await foreign.exportBackup());owner=await Participant.begin(f.input.file(),options);await assert.rejects(owner.finish());assert.deepEqual(await bytes(await foreign.exportBackup()),before);}
 finally{await owner?.discardAndClose();foreign?.close();await f.close();}
});
test('changed durable input refuses before a component can be reopened',async()=>{
 const f=await fixture();let owner;
 try{owner=await Participant.begin(f.input.file(),f.options);await owner.finish();await owner.discardAndClose();owner=undefined;await change(f.options.database,'restored_participant_input',s=>s.put(new Blob(['changed']),'input'));const source=await databaseValues(f.options.sourceDatabase),uploads=await databaseValues(f.options.uploadsDatabase);await assert.rejects(Participant.resume(f.options));assert.deepEqual(await databaseValues(f.options.sourceDatabase),source);assert.deepEqual(await databaseValues(f.options.uploadsDatabase),uploads);}
 finally{await owner?.discardAndClose();await f.close();}
});
test('revocation after a real retained store opens can retry its partial owner without discarding input',async()=>{
 const f=await fixture();let owner,parts,existing,allowed=true,reads=0,armed=false;const transaction=IDBDatabase.prototype.transaction;
 try{existing=await rich.RichAssetStore.restoreBackup(f.options.uploadsDatabase,f.uploadFile,{uploadState:'preserve'});existing.close();existing=undefined;const options={...f.options,checkAuthority(){if(!allowed)throw Error('revoked');}};owner=await Participant.begin(f.input.file(),options);IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(this.name===options.uploadsDatabase&&args[1]==='readonly'&&++reads===2)tx.addEventListener('complete',()=>{armed=true;allowed=false;});return tx;};await assert.rejects(owner.finish());assert.equal(armed,true);allowed=true;IDBDatabase.prototype.transaction=transaction;await owner.finish();assert.deepEqual(owner.readableSource(),f.live);parts=await owner.intoParts();assert.deepEqual(await bytes(await parts.uploads.exportBackup()),await bytes(f.uploadFile));}
 finally{allowed=true;IDBDatabase.prototype.transaction=transaction;await closeParts(parts);await owner?.discardAndClose();existing?.close();await f.close();}
});
test('late actual lease callback revocation keeps source/input/uploads for same-owner retry',async()=>{
 const f=await fixture();let owner,parts,allowed=true,armed=false;const host=navigator.locks,request=host.request;
 try{const options={...f.options,checkAuthority(){if(!allowed)throw Error('revoked');}};host.request=function(name,...args){return request.call(this,name,...args).then(v=>{if(armed&&name==='breditor:participant-recovery:'+JSON.stringify(options.database)){armed=false;allowed=false;}return v;});};owner=await Participant.begin(f.input.file(),options);await owner.finish();armed=true;await assert.rejects(owner.intoParts());assert.equal(allowed,false);assert.deepEqual(owner.readableSource(),f.live);assert.deepEqual(await bytes(owner.file()),await bytes(f.input.file()));allowed=true;parts=await owner.intoParts();insertCleanupText(parts.source.session.core,'Fresh after retry ');await parts.source.session.flush();await parts.uploads.retry(secondAsset);assert.equal((await parts.uploads.get(secondAsset)).status,'pending');}
 finally{allowed=true;host.request=request;await closeParts(parts);await owner?.discardAndClose();await f.close();}
});
test('current policy and four distinct actual targets are required before creating a parent',async()=>{
 const f=await fixture();try{for(const options of[{...f.options,checkAuthority:async()=>{}},{...f.options,uploadsDatabase:f.options.sourceDatabase},{...f.options,writerRecovery:'assumed'},{...f.options,cohort:{ready:true}}])await assert.rejects(Participant.begin(f.input.file(),options));assert.equal((await indexedDB.databases()).some(r=>r.name===f.options.database),false);}finally{await f.close();}
});
