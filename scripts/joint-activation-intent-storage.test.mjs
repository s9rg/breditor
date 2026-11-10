/** Real execution archives and native hashing; synthetic wire declarations are
 * used only to test the new descriptor/store. No test asserts Native serving,
 * actor transfer or whole-room readiness from these records. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {IDBObjectStore} from 'fake-indexeddb';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {assertActivationReopensAfterFailedClose,assertActivationReopensAfterLateClose} from './fixtures/late-activation-intent-open.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {selection as publication,receipt} from './fixtures/native-publication/transport.mjs';
import {jointRoomActivationPlan,jointRoomActivationIntentChoice} from '../packages/breditor-collaboration/dist/native_room_joint_activation/intent_identity.js';
import {JointRoomActivationIntentStore as Store,jointRoomPublicationBinding} from '../packages/breditor-collaboration/dist/native_room_joint_activation/intent_store.js';
import {captureJointRoomActivationIntent} from '../packages/breditor-collaboration/dist/native_room_joint_activation/intent_capture.js';
let fixtures,transport,f,base,sequence=0;const code=value=>error=>error?.code===value;
before(async()=>{
 fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);f=await preparedRoomRun(fixtures,'joint-intent-storage');
 const wire=publication(),activation={format:'breditor/room-native-activation-intent',formatVersion:1,database:'original-native-intent',activation:structuredClone(wire.activation),graph:{bytes:17,sha256:'a'.repeat(64)},objects:[],totalBytes:17},current=f.options.expected.execution.plan.preparation.plan.before;
 base={format:'breditor/joint-native-room-activation-plan',formatVersion:1,database:'joint-plan-base',sourceNamespaces:[...new Set(f.f.sourceNamespaces)].sort(),activation,execution:f.options.expected,origin:{selection:{format:'breditor/joint-activation-metadata-origin',formatVersion:1,activation:structuredClone(activation),prepared:{format:'breditor/selected-native-delivery-preparation',formatVersion:1,database:'original-delivery-preparation',server:{format:'breditor/server-log-generation-recovery-control',formatVersion:1,instance:'8'.repeat(64),source:wire.activation.current},before:structuredClone(current)},current:structuredClone(current),review:{bytes:16,sha256:'b'.repeat(64)},metadata:{bytes:24,sha256:'c'.repeat(64)}},reviewDatabase:'original-review-journal',metadataDatabase:'original-metadata-journal'},destinations:{database:'continued-intent',preparationDatabase:'continued-preparation',reviewDatabase:'continued-review',metadataDatabase:'continued-metadata'},publication:wire};
 jointRoomActivationPlan(base);
});
after(async()=>{await f?.close();transport?.restore();await fixtures?.close();});
function choice(update=()=>{}){const raw=structuredClone(base);raw.database='joint-plan-'+sequence++;update(raw);const plan=jointRoomActivationPlan(raw),text=JSON.stringify(plan);return jointRoomActivationIntentChoice({format:'breditor/joint-native-room-activation-intent',formatVersion:1,plan,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});}
const options=()=>({wasm:fixtures.native,checkAuthority(){}});
async function raw(name,visit){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('joint','readwrite');visit(tx.objectStore('joint'));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
test('literal associations retain independent formats and reject mismatched sources or publication targets',()=>{
 const selected=choice();assert.equal(Object.isFrozen(selected.plan.execution),true);assert.deepEqual(selected.plan.activation.activation,selected.plan.publication.activation);assert.deepEqual(selected.plan.origin.selection.current,selected.plan.execution.execution.plan.preparation.plan.before);
 for(const update of [p=>p.publication.activation.planned.owner='3'.repeat(64),p=>p.origin.selection.activation.database='other-native-intent',p=>p.origin.selection.current.sha256='d'.repeat(64)])assert.throws(()=>choice(update),code('joint_activation_intent_policy'));
});
test('all declared source, execution, journal and continuation namespaces exclude the new descriptor and destinations',()=>{
 const names=[...base.sourceNamespaces,base.activation.database,base.origin.selection.prepared.database,base.origin.reviewDatabase,base.origin.metadataDatabase,base.execution.database,base.execution.execution.plan.layout.database,base.execution.execution.plan.preparation.plan.participants[0].namespaces[0].database];
 for(const name of names)for(const slot of ['database','preparationDatabase','reviewDatabase','metadataDatabase'])assert.throws(()=>choice(p=>{p.destinations[slot]=name;}),code('joint_activation_intent_policy'));
 assert.throws(()=>choice(p=>{p.destinations.reviewDatabase=p.destinations.metadataDatabase;}));assert.throws(()=>choice(p=>{p.database=p.destinations.database;}));
});
test('reconstruction preparation and metadata continuation preparation require different namespaces',()=>{
 assert.throws(()=>choice(plan=>{plan.destinations.preparationDatabase=plan.execution.execution.plan.preparation.plan.database;}),code('joint_activation_intent_policy'));
 const actual=choice(plan=>{plan.destinations.preparationDatabase='explicit-distinct-metadata-preparation';});
 assert.notEqual(actual.plan.destinations.preparationDatabase,actual.plan.execution.execution.plan.preparation.plan.database);
});
test('new data admission invokes no getters or toJSON and refuses cycles, extra fields, sparse arrays and prototype instances',()=>{
 let calls=0;const accessor={...base};Object.defineProperty(accessor,'database',{enumerable:true,get(){calls++;return'getter';}});assert.throws(()=>jointRoomActivationPlan(accessor));
 const formatter={...base,toJSON(){calls++;return base;}};assert.throws(()=>jointRoomActivationPlan(formatter));const cycle={...base};cycle.origin=cycle;assert.throws(()=>jointRoomActivationPlan(cycle));
 assert.throws(()=>choice(p=>{p.sourceNamespaces=new Array(3);}));assert.throws(()=>jointRoomActivationPlan(Object.assign(Object.create({custom:true}),base)));assert.equal(calls,0);
});
test('genuine capture rejects scope-shaped input before reading metadata, run, host or database declarations',async()=>{
 let reflected=0;const input=new Proxy({},{ownKeys(){reflected++;throw Error('No declaration read');},get(){reflected++;throw Error('No declaration access');}});
 for(const scope of [{},{check(){throw Error('No copied scope');}}])await assert.rejects(captureJointRoomActivationIntent(scope,{},input));assert.equal(reflected,0);
});
test('storage requires a synchronous affirmative authority check and accepts no returned promise or value',()=>{
 for(const checkAuthority of [()=>true,()=>Promise.resolve()])assert.throws(()=>new Store(choice(),{...options(),checkAuthority}),code('archive_authority'));
});
test('missing existing-only descriptor creates no namespace and first creation never overwrites committed data',async()=>{
 const selected=choice(),missing=new Store(selected,options());try{await assert.rejects(missing.open(),code('joint_activation_intent_missing'));}finally{await missing.close();}assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);
 const a=new Store(selected,options());try{assert.equal((await a.open(true)).phase,'prepared');}finally{await a.close();}
 const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let writes=0;const b=new Store(selected,options());try{IDBObjectStore.prototype.add=function(...args){if(this.transaction.db.name===selected.plan.database)writes++;return add.apply(this,args);};IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===selected.plan.database)writes++;return put.apply(this,args);};await assert.rejects(b.open(true),code('joint_activation_intent_exists'));assert.equal(writes,0);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await b.close();}
});
test('publication observations survive cold exact reopen while exposing no owner, approval or activation action',async()=>{
 const selected=choice(),a=new Store(selected,options()),expected=JSON.parse(receipt({selection:selected.plan.publication,joint:jointRoomPublicationBinding(selected)}));
 try{await a.open(true);await assert.rejects(a.markPublicationObserved(expected));assert.equal((await a.markPublicationStarted()).phase,'request-started');const result=await a.markPublicationObserved(expected);assert.equal(result.phase,'receipt-observed');assert.deepEqual(result.receipt,expected);assert.deepEqual(await a.markPublicationStarted(),result);await a.close();
  const b=new Store(selected,options());try{assert.deepEqual(await b.open(),result);assert.equal('takeOwner'in b,false);assert.equal('activate'in b,false);assert.equal('approve'in b,false);const wrong=structuredClone(expected);wrong.joint.sha256[0]^=1;await assert.rejects(b.markPublicationObserved(wrong));assert.deepEqual(await b.read(),result);}finally{await b.close();}
 }finally{await a.close();}
});
test('descriptor-pin mismatch and exact stored corruption refuse without repairing or replacing data',async()=>{
 const selected=choice(),changed={...selected,sha256:'0'.repeat(64)},a=new Store(changed,options());try{await assert.rejects(a.open(true),code('joint_activation_intent_integrity'));}finally{await a.close();}assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);
 const b=new Store(selected,options());try{await b.open(true);await raw(selected.plan.database,s=>s.put(JSON.stringify({...selected,sha256:'0'.repeat(64)}),'choice'));await assert.rejects(b.read(),code('joint_activation_intent_integrity'));}finally{await b.close();}
 const c=new Store(selected,options());try{await assert.rejects(c.open(),code('joint_activation_intent_integrity'));}finally{await c.close();}
});
test('transaction cancellation aborts descriptor creation atomically; a later fresh attempt can create it',async()=>{
 const selected=choice(),stop=new AbortController(),a=new Store(selected,{...options(),signal:stop.signal}),add=IDBObjectStore.prototype.add;let hits=0;
 try{IDBObjectStore.prototype.add=function(...args){const result=add.apply(this,args);if(this.transaction.db.name===selected.plan.database){hits++;stop.abort();}return result;};await assert.rejects(a.open(true));assert.ok(hits);}finally{IDBObjectStore.prototype.add=add;await a.close();}
 assert.equal((await indexedDB.databases()).some(row=>row.name===selected.plan.database),false);const b=new Store(selected,options());try{assert.equal((await b.open(true)).phase,'prepared');}finally{await b.close();}
});
test('an uncertain committed creation retains the original descriptor and resolves through existing-only read',async()=>{
 const selected=choice(),add=IDBObjectStore.prototype.add;let committed=false;const a=new Store(selected,{...options(),checkAuthority(){if(committed)throw Error('Test-owned lost descriptor completion');}});
 try{IDBObjectStore.prototype.add=function(...args){const result=add.apply(this,args);if(this.transaction.db.name===selected.plan.database)this.transaction.addEventListener('complete',()=>{committed=true;},{once:true});return result;};await assert.rejects(a.open(true));assert.equal(committed,true);}finally{IDBObjectStore.prototype.add=add;await a.close();}
 const b=new Store(selected,options());try{assert.equal((await b.open()).phase,'prepared');}finally{await b.close();}
});
test('unexpected durable rows and malformed publication state refuse on exact existing reopen',async()=>{
 for(const malformed of [s=>s.add('extra','foreign'),s=>s.put('{"phase":"receipt-observed"}','state')]){const selected=choice(),a=new Store(selected,options());try{await a.open(true);}finally{await a.close();}await raw(selected.plan.database,malformed);const b=new Store(selected,options());try{await assert.rejects(b.open(),code('joint_activation_intent_integrity'));}finally{await b.close();}}
});

test('a late cancelled activation intent open permits a new owner after the request settles',()=>{
 const selected=choice();
 return assertActivationReopensAfterLateClose({
  database:selected.plan.database,
  createStore:signal=>new Store(selected,signal?{...options(),signal}:options()),
  create:store=>store.open(true),
  busyCode:'joint_activation_intent_busy',
  closedCode:'joint_activation_intent_closed',
 });
});
test('a fresh joint intent owner drains a failed database close and reads the exact prior observation',()=>{
 const selected=choice();
 return assertActivationReopensAfterFailedClose({
  database:selected.plan.database,
  createStore:()=>new Store(selected,options()),
  create:store=>store.open(true),
  advance:store=>store.markPublicationStarted(),
 });
});
