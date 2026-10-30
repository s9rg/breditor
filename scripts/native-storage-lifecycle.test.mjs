/** Genuine native cuts, terminal closure cleanup, unchanged bytes and future history. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {IDBDatabase,IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {OperationalIndependentDeliveryParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {operationJournalBinding} from '../packages/breditor-collaboration/dist/independent_operation/cut_journal.js';
import {independentDeliverySource} from '../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import {readOperationSourceDatabase} from '../packages/breditor-collaboration/dist/independent_operation/read_source_database.js';
import {LocalMetadataDeliveryStore} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/store.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {portableFixture} from './fixtures/independent-operation/portable.mjs';
import {databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
import {localMetadataFixture} from './fixtures/local-metadata/session.mjs';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
function observeTransactions(name){const original=IDBDatabase.prototype.transaction,transactions=[];IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(this.name===name)transactions.push(tx);return tx;};return {transactions,restore(){IDBDatabase.prototype.transaction=original;}};}
function released(transactions){assert.ok(transactions.length>0);for(const tx of transactions)for(const field of ['oncomplete','onabort','onerror'])assert.equal(tx[field],null,field+' releases its terminal closure');}

test('repeated exact native source reads release owned callbacks, keep data, and preserve future Undo/Redo',async()=>{
 const restore=environment(),profile=nativeProfile(native,3,true),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let f,observer;
 try{f=await portableFixture({api,rich,Participant,profile,seed,tag:'native-storage-lifecycle'});insertCleanupText(f.source.core,'Large retained native cut 🙂 '.repeat(1000));await f.source.flush();const binding=operationJournalBinding(independentDeliverySource(f.source).operation),id=binding.identity.history.native,key=[id.room,id.writer],name=f.options.sourceDatabase;
  const read=()=>readOperationSourceDatabase(name,key,binding.readHead,f.readOptions.checkAuthority),expected=await read(),before=await databaseValues(name);assert.ok(expected.documentCheckpoint.includes('Large retained native cut'));
  observer=observeTransactions(name);for(let i=0;i<24;i++)assert.deepEqual(await read(),expected);released(observer.transactions);for(const tx of observer.transactions)assert.equal(tx.db.onversionchange,null,'Only the temporary source connection watch is released');observer.restore();observer=undefined;
  assert.deepEqual(await databaseValues(name),before);const document=f.source.core.documentJson();assert.equal(f.source.core.undo(),true);assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.documentJson(),document);
  const review=()=>f.source.core.reviewSnapshot().view.threads.map(({thread})=>({id:thread.id,state:thread.state,hidden:thread.hidden,messages:thread.messages.map(message=>({id:message.id,author:message.author,bodies:message.versions.map(({principal,text})=>({principal,text}))}))}));const accepted=review();assert.equal(f.source.core.undoReview().kind,'committed');assert.equal(f.source.core.redoReview().kind,'committed');assert.deepEqual(review(),accepted);
  let armed=true;const get=IDBObjectStore.prototype.getAll;observer=observeTransactions(name);try{IDBObjectStore.prototype.getAll=function(...args){const q=get.apply(this,args);if(armed&&this.transaction.db.name===name){armed=false;q.addEventListener('success',()=>f.setRead(false),{once:true});}return q;};await assert.rejects(read(),/read revoked/);assert.equal(armed,false);released(observer.transactions);for(const tx of observer.transactions)assert.equal(tx.db.onversionchange,null);}finally{f.setRead(true);IDBObjectStore.prototype.getAll=get;observer.restore();observer=undefined;}assert.deepEqual(await databaseValues(name),before);
 }finally{observer?.restore();await f?.close();profile.free();restore();}
});

test('metadata reads release large copies without losing live invalidation or committed facts on late refusal',async()=>{
 const f=await localMetadataFixture(native);let allowed=true,armed=false,observer,store;const put=IDBObjectStore.prototype.put;
 try{store=new LocalMetadataDeliveryStore(f.choice,()=>{if(!allowed)throw Error('Authority revoked after commit');});const before=await store.open(f.state);observer=observeTransactions(f.choice.database);for(let i=0;i<20;i++)assert.deepEqual(await store.readFresh(),before);released(observer.transactions);for(const tx of observer.transactions)assert.equal(typeof tx.db.onversionchange,'function','The active owner keeps its invalidation watch');
  IDBObjectStore.prototype.put=function(...args){if(armed&&this.transaction.db.name===f.choice.database&&args[1]==='current'){armed=false;this.transaction.addEventListener('complete',()=>{allowed=false;},{once:true});}return put.apply(this,args);};armed=true;await assert.rejects(store.replace(before,{...before.current,revision:1}),/Authority revoked after commit/);assert.equal(armed,false);released(observer.transactions);assert.equal(store.committed().current.revision,1);assert.deepEqual(store.committed().before,before.before);allowed=true;assert.deepEqual(await store.readFresh(),store.committed());await store.close();for(const tx of observer.transactions)assert.equal(tx.db.onversionchange,null,'The actual owner close releases its watch');
 }finally{allowed=true;IDBObjectStore.prototype.put=put;observer?.restore();await store?.close();await f.close();}
});
