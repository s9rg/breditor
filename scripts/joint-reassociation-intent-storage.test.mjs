/** Durable restart-association laws over real room choices, with synthetic
 * control/receipt DATA only. No test grants Native serving from these records. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {IDBObjectStore} from 'fake-indexeddb';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {assertActivationReopensAfterFailedClose,assertActivationReopensAfterLateClose} from './fixtures/late-activation-intent-open.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {selection as publication,receipt} from './fixtures/native-publication/transport.mjs';
import {jointRoomActivationPlan,jointRoomActivationIntentChoice} from '../packages/breditor-collaboration/dist/native_room_joint_activation/intent_identity.js';
import {jointReassociationPlan,jointReassociationChoice,reassociationPredecessorChoice} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/identity.js';
import {JointReassociationIntentStore as Store,jointReassociationPublicationBinding} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/intent_store.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),code=value=>error=>error?.code===value;
let fixtures,transport,f,base,sequence=0;
before(async()=>{
 fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);f=await preparedRoomRun(fixtures,'joint-reassociation-storage');
 const wire=publication(),activation={format:'breditor/room-native-activation-intent',formatVersion:1,database:'original-native-intent',activation:structuredClone(wire.activation),graph:{bytes:17,sha256:'a'.repeat(64)},objects:[],totalBytes:17},current=f.options.expected.execution.plan.preparation.plan.before;
 base={format:'breditor/joint-native-room-activation-plan',formatVersion:1,database:'joint-plan-base',sourceNamespaces:[...new Set(f.f.sourceNamespaces)].sort(),activation,execution:f.options.expected,origin:{selection:{format:'breditor/joint-activation-metadata-origin',formatVersion:1,activation:structuredClone(activation),prepared:{format:'breditor/selected-native-delivery-preparation',formatVersion:1,database:'original-delivery-preparation',server:{format:'breditor/server-log-generation-recovery-control',formatVersion:1,instance:'8'.repeat(64),source:wire.activation.current},before:structuredClone(current)},current:structuredClone(current),review:{bytes:16,sha256:'b'.repeat(64)},metadata:{bytes:24,sha256:'c'.repeat(64)}},reviewDatabase:'original-review-journal',metadataDatabase:'original-metadata-journal'},destinations:{database:'continued-intent',preparationDatabase:'continued-preparation',reviewDatabase:'continued-review',metadataDatabase:'continued-metadata'},publication:wire};
 jointRoomActivationPlan(base);
});
after(async()=>{await f?.close();transport?.restore();await fixtures?.close();});
function original(){const plan=jointRoomActivationPlan(base),text=JSON.stringify(plan);return jointRoomActivationIntentChoice({format:'breditor/joint-native-room-activation-intent',formatVersion:1,plan,bytes:Buffer.byteLength(text),sha256:sha(text)});}
function next(previous,committed=false,update=()=>{}){
 const root=previous?.plan.original??original(),last=previous?.plan??root.plan,tag='reassociation-'+sequence++,activation=structuredClone(last.activation),wire=activation.activation;
 activation.database=tag+'-native';wire.instance=sha(tag+'-activation');
 if(committed){wire.previous=structuredClone(last.activation.activation.planned);wire.planned={...wire.planned,generation:(BigInt(wire.previous.generation)+1n).toString(),owner:sha(tag+'-owner')};wire.checkpointSha256=[...createHash('sha256').update(tag+'-checkpoint').digest()];}
 const predecessors=previous?[...previous.plan.predecessors,(()=>{const{format,formatVersion,original,predecessors,...record}=previous.plan;return{...record,bytes:previous.bytes,sha256:previous.sha256};})()]:[];
 const raw={format:'breditor/joint-native-room-reassociation-plan',formatVersion:1,database:tag+'-intent',original:root,predecessors,activation,publication:{...structuredClone(last.publication),instance:sha(tag+'-publication'),activation:structuredClone(wire)},destinations:{database:tag+'-continuation',preparationDatabase:tag+'-preparation',reviewDatabase:tag+'-review',metadataDatabase:tag+'-metadata'},prior:{format:'breditor/metadata-continuation-absence',formatVersion:1,destinations:structuredClone(last.destinations)}};
 update(raw);return choose(raw);
}
function choose(raw){const plan=jointReassociationPlan(raw),text=JSON.stringify(plan);return jointReassociationChoice({format:'breditor/joint-native-room-reassociation-intent',formatVersion:1,plan,bytes:Buffer.byteLength(text),sha256:sha(text)});}
const options=()=>({wasm:fixtures.native,checkAuthority(){}});
async function raw(name,visit){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('reassociation','readwrite');visit(tx.objectStore('reassociation'));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
test('pending restart keeps its epoch while binding fresh controls and new destinations',()=>{
 const source=original(),before=JSON.stringify(source),selected=next();assert.deepEqual(selected.plan.activation.activation.previous,source.plan.activation.activation.previous);assert.deepEqual(selected.plan.activation.activation.planned,source.plan.activation.activation.planned);assert.notEqual(selected.plan.activation.activation.instance,source.plan.activation.activation.instance);assert.deepEqual(selected.plan.activation.graph,source.plan.activation.graph);assert.equal(JSON.stringify(source),before);assert.ok(Object.isFrozen(selected.plan.prior));
});
test('committed restart admits the direct next epoch and refuses altered source, capture, listener or floor',()=>{
 const selected=next(undefined,true),old=selected.plan.original.plan.activation.activation;assert.deepEqual(selected.plan.activation.activation.previous,old.planned);
 for(const update of[p=>p.activation.activation.current.room='other',p=>p.activation.graph.sha256='0'.repeat(64),p=>p.publication.listener='127.0.0.1:1',p=>p.activation.activation.previous.identity.authority='other',p=>p.activation.activation.planned.owner='1'.repeat(64),p=>p.publication.activation.instance='9'.repeat(64)])assert.throws(()=>next(undefined,false,update));
});
test('linear predecessor entries reconstruct every exact earlier association through repeated restarts',()=>{
 const a=next(),b=next(a,true),c=next(b),d=next(c,true);assert.deepEqual(reassociationPredecessorChoice(d.plan,0),a);assert.deepEqual(reassociationPredecessorChoice(d.plan,1),b);assert.deepEqual(reassociationPredecessorChoice(d.plan,2),c);assert.deepEqual(d.plan.prior.destinations,c.plan.destinations);assert.throws(()=>reassociationPredecessorChoice(d.plan,3));
 const wrong=structuredClone(d.plan);wrong.predecessors.reverse();assert.throws(()=>choose(wrong));
});
test('every original and earlier namespace excludes new association, Native intent and metadata destinations',()=>{
 const a=next(),names=[base.database,base.activation.database,...base.sourceNamespaces,...Object.values(base.destinations),base.execution.database,base.execution.execution.plan.layout.database,a.plan.database,a.plan.activation.database,...Object.values(a.plan.destinations)];
 for(const name of names)for(const slot of ['database','native','metadata'])assert.throws(()=>next(a,false,p=>{if(slot==='database')p.database=name;else if(slot==='native')p.activation.database=name;else p.destinations.metadataDatabase=name;}));
 assert.throws(()=>next(undefined,false,p=>{p.destinations.reviewDatabase=p.destinations.metadataDatabase;}));assert.throws(()=>next(a,false,p=>{p.prior.destinations=base.destinations;}));
});
test('closed admission refuses getters, toJSON, prototype objects and cycles without invocation',()=>{
 const selected=next(),plain=structuredClone(selected.plan);let reflected=0;Object.defineProperty(plain,'database',{enumerable:true,get(){reflected++;return'other';}});assert.throws(()=>jointReassociationPlan(plain));
 assert.throws(()=>jointReassociationPlan({...structuredClone(selected.plan),toJSON(){reflected++;return selected.plan;}}));const cycle=structuredClone(selected.plan);cycle.prior=cycle;assert.throws(()=>jointReassociationPlan(cycle));assert.throws(()=>jointReassociationPlan(Object.assign(Object.create({custom:true}),selected.plan)));assert.equal(reflected,0);
});
test('existing-only open never creates; first creation refuses occupied bytes without writes',async()=>{
 const selected=next(),missing=new Store(selected,options());try{await assert.rejects(missing.open(),code('joint_activation_intent_missing'));}finally{await missing.close();}assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);
 const a=new Store(selected,options());try{assert.equal((await a.open(true)).phase,'prepared');}finally{await a.close();}
 const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let writes=0;const b=new Store(selected,options());try{IDBObjectStore.prototype.add=function(...args){if(this.transaction.db.name===selected.plan.database)writes++;return add.apply(this,args);};IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===selected.plan.database)writes++;return put.apply(this,args);};await assert.rejects(b.open(true),code('joint_activation_intent_exists'));assert.equal(writes,0);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await b.close();}
});
test('every predecessor and original digest is checked before creating the new descriptor',async()=>{
 const a=next(),b=next(a,true);for(const update of[p=>p.original.sha256='0'.repeat(64),p=>p.predecessors[0].sha256='0'.repeat(64)]){const p=structuredClone(b.plan);p.database+='-bad-'+sequence++;update(p);const selected=choose(p),store=new Store(selected,options());try{await assert.rejects(store.open(true),code('joint_activation_intent_integrity'));}finally{await store.close();}assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);}
});
test('publication state is advisory DATA bound to the complete new lineage and exact receipt',async()=>{
 const a=next(),selected=next(a,true),store=new Store(selected,options()),binding=jointReassociationPublicationBinding(selected),expected=JSON.parse(receipt({selection:selected.plan.publication,joint:binding}));let resumed;
 try{await store.open(true);await assert.rejects(store.markPublicationObserved(expected));await store.markPublicationStarted();const result=await store.markPublicationObserved(expected);assert.equal(result.phase,'receipt-observed');assert.deepEqual(await store.markPublicationStarted(),result);await store.close();resumed=new Store(selected,options());assert.deepEqual(await resumed.open(),result);assert.equal('takeOwner'in resumed,false);assert.equal('activate'in resumed,false);const wrong=structuredClone(expected);wrong.joint.sha256[0]^=1;await assert.rejects(resumed.markPublicationObserved(wrong));assert.deepEqual(await resumed.read(),result);}finally{await resumed?.close();await store.close();}
});
test('stored descriptor corruption refuses without overwriting the corrupt evidence',async()=>{
 const selected=next(),store=new Store(selected,options());let reopened;try{await store.open(true);await raw(selected.plan.database,s=>s.put(JSON.stringify({...selected,sha256:'0'.repeat(64)}),'choice'));await assert.rejects(store.read(),code('joint_activation_intent_integrity'));await store.close();reopened=new Store(selected,options());await assert.rejects(reopened.open(),code('joint_activation_intent_integrity'));}finally{await reopened?.close();await store.close();}
});
test('transaction cancellation aborts creation atomically and a new attempt can create later',async()=>{
 const selected=next(),stop=new AbortController(),store=new Store(selected,{...options(),signal:stop.signal}),add=IDBObjectStore.prototype.add;let hits=0;
 try{IDBObjectStore.prototype.add=function(...args){const request=add.apply(this,args);if(this.transaction.db.name===selected.plan.database){hits++;stop.abort();}return request;};await assert.rejects(store.open(true));assert.ok(hits);}finally{IDBObjectStore.prototype.add=add;await store.close();}
 assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);const fresh=new Store(selected,options());try{assert.equal((await fresh.open(true)).phase,'prepared');}finally{await fresh.close();}
});
test('same-namespace competition cannot steal a held association lease',async()=>{
 const selected=next(),a=new Store(selected,options()),b=new Store(selected,options());try{await a.open(true);await assert.rejects(b.open(),code('joint_activation_intent_busy'));a.check();assert.equal((await a.read()).phase,'prepared');}finally{await b.close();await a.close();}
});
test('versionchange revokes the actual reader and preserves later schema data',async()=>{
 const selected=next(),store=new Store(selected,options());let db;try{await store.open(true);db=await new Promise((resolve,reject)=>{const q=indexedDB.open(selected.plan.database,2);q.onupgradeneeded=()=>q.result.createObjectStore('later').add('keep','value');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});assert.throws(()=>store.check(),code('joint_activation_intent_closed'));await assert.rejects(store.read());}finally{db?.close();await store.close();}
});

test('a late cancelled reassociation intent open permits a new owner after the request settles',()=>{
 const selected=next();
 return assertActivationReopensAfterLateClose({
  database:selected.plan.database,
  createStore:signal=>new Store(selected,signal?{...options(),signal}:options()),
  create:store=>store.open(true),
  busyCode:'joint_activation_intent_busy',
  closedCode:'joint_activation_intent_closed',
 });
});
test('a fresh reassociation intent owner drains a failed database close and reads the exact prior observation',()=>{
 const selected=next();
 return assertActivationReopensAfterFailedClose({
  database:selected.plan.database,
  createStore:()=>new Store(selected,options()),
  create:store=>store.open(true),
  advance:store=>store.markPublicationStarted(),
 });
});
