/** Exact native/file retention across real terminal transaction interruptions.
 * Controlled IDB faults are not physical crash-durability qualification. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{IDBObjectStore}from'fake-indexeddb';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{localRecoveryUnitHost}from'./fixtures/independent-recovery/unit.mjs';import{localRecoveryOptions,closeLocalRecoveryParts,verifyLocalRecoveryParts}from'./fixtures/independent-recovery/session.mjs';
import{recoveryFaults,databaseValues,change,unknownDatabase}from'./fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_INDEPENDENT_RECOVERY_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localRecoveryUnitHost({api,rich,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());const fixture=extra=>host.fixture(extra);
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])for(const kind of['abort','lost-ack'])for(const number of[1,2,3,4,5])test(`local attempt ${kind} boundary=${number} document=${documentSegmented} comments=${reviewSegmented} resumes exact owners`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented}),options=localRecoveryOptions(f.options,f.backup,f.tag),faults=recoveryFaults();let attempt,ready,parts;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});faults.select(options.database,'independent_attempts',number,kind);await assert.rejects(attempt.finish());assert.ok(faults.observed.length>=number);faults.clear();await attempt.close();attempt=await api.SharedIndependentParticipantRecovery.resume(options);ready=await attempt.finish();parts=await ready.intoParts();ready=undefined;await verifyLocalRecoveryParts(api,f,parts);}
 finally{faults.restore();await closeLocalRecoveryParts(parts);await ready?.discardAndClose();await attempt?.close();await f.close();}
});
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])for(const kind of['abort','lost-ack'])for(const component of['source','uploads'])test(`local ${component} ${kind} document=${documentSegmented} comments=${reviewSegmented} re-admits actual bytes`,async()=>{
 const f=await fixture({documentSegmented,reviewSegmented}),options=localRecoveryOptions(f.options,f.backup,f.tag),faults=recoveryFaults();let attempt,ready,parts;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});faults.select(options.destinations[component],component==='source'?'history_heads':'assets',1,kind);await assert.rejects(attempt.finish());assert.ok(faults.observed.length>=1);faults.clear();await attempt.close();attempt=await api.SharedIndependentParticipantRecovery.resume(options);ready=await attempt.finish();parts=await ready.intoParts();ready=undefined;await verifyLocalRecoveryParts(api,f,parts);}
 finally{faults.restore();await closeLocalRecoveryParts(parts);await ready?.discardAndClose();await attempt?.close();await f.close();}
});
for(const component of['source','uploads','attempt'])test('local begin never overwrites occupied '+component+' storage',async()=>{
 const f=await fixture(),options=localRecoveryOptions(f.options,f.backup,f.tag),name=component==='attempt'?options.database:options.destinations[component];try{await unknownDatabase(name);const before=await databaseValues(name);await assert.rejects(api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup}));assert.deepEqual(await databaseValues(name),before);}finally{await f.close();}
});
test('same live local attempt adopts only its own commit-before-ack update',async()=>{
 const f=await fixture(),options=localRecoveryOptions(f.options,f.backup,f.tag),faults=recoveryFaults();let attempt,ready,parts;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});faults.select(options.database,'independent_attempts',2,'lost-ack');await assert.rejects(attempt.finish());faults.clear();assert.equal((await attempt.progress()).source,'complete');ready=await attempt.finish();parts=await ready.intoParts();ready=undefined;await verifyLocalRecoveryParts(api,f,parts);}finally{faults.restore();await closeLocalRecoveryParts(parts);await ready?.discardAndClose();await attempt?.close();await f.close();}
});
for(const component of['source','uploads'])test('local ready marker cannot silently rebuild missing '+component,async()=>{
 const f=await fixture(),options=localRecoveryOptions(f.options,f.backup,f.tag);let attempt,ready;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});ready=await attempt.finish();await ready.close();ready=undefined;await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(options.destinations[component]);q.onsuccess=resolve;q.onerror=()=>reject(q.error);});attempt=await api.SharedIndependentParticipantRecovery.resume(options);await assert.rejects(attempt.finish());assert.equal((await indexedDB.databases()).some(row=>row.name===options.destinations[component]),false);}finally{await ready?.discardAndClose();await attempt?.close();await f.close();}
});
for(const store of['independent_attempts','independent_originals'])test('local resume counts '+store+' before reading its values',async()=>{
 const f=await fixture(),options=localRecoveryOptions(f.options,f.backup,f.tag),get=IDBObjectStore.prototype.get;let attempt,clones=0;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});await attempt.close();await change(options.database,store,s=>s.add(store==='independent_originals'?new Blob(['retained foreign bytes']):'foreign','foreign'));const before=await databaseValues(options.database);
  IDBObjectStore.prototype.get=function(...args){if(this.transaction.db.name===options.database&&this.name===store){clones++;throw Error('An overfull store must be counted before get');}return get.apply(this,args);};await assert.rejects(api.SharedIndependentParticipantRecovery.resume(options));assert.equal(clones,0);IDBObjectStore.prototype.get=get;assert.deepEqual(await databaseValues(options.database),before);
 }finally{IDBObjectStore.prototype.get=get;await attempt?.close();await f.close();}
});
for(const component of['source','uploads'])test('changed complete local '+component+' is refused without repairing its bytes',async()=>{
 const f=await fixture(),options=localRecoveryOptions(f.options,f.backup,f.tag);let attempt,ready;
 try{attempt=await api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup});ready=await attempt.finish();await ready.close();ready=undefined;if(component==='source')await change(options.destinations.source,'history_files',s=>s.add('foreign',['room','101','review','foreign']));else await change(options.destinations.uploads,'metadata',s=>s.put(123456,'bytes'));const before=await databaseValues(options.destinations[component]);attempt=await api.SharedIndependentParticipantRecovery.resume(options);await assert.rejects(attempt.finish());assert.deepEqual(await databaseValues(options.destinations[component]),before);}finally{await ready?.discardAndClose();await attempt?.close();await f.close();}
});
test('cancellation inside the initial original-file transaction leaves no partial local attempt',async()=>{
 const f=await fixture(),abort=new AbortController(),options=localRecoveryOptions(f.options,f.backup,f.tag,{signal:abort.signal}),add=IDBObjectStore.prototype.add;let hits=0;
 try{IDBObjectStore.prototype.add=function(...args){const request=add.apply(this,args);if(this.transaction.db.name===options.database&&this.name==='independent_originals'){hits++;abort.abort();}return request;};await assert.rejects(api.SharedIndependentParticipantRecovery.begin({...options,backup:f.backup}));assert.equal(hits,1);IDBObjectStore.prototype.add=add;assert.equal((await indexedDB.databases()).some(row=>row.name===options.database),false);assert.equal((await indexedDB.databases()).some(row=>row.name===options.destinations.source),false);}finally{IDBObjectStore.prototype.add=add;await f.close();}
});
