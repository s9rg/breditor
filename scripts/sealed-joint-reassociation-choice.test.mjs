/** Real retained whole-room choices with new control/receipt DATA. The local
 * journal checks make no request and cannot confer Native serving authority. */
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {IDBFactory,IDBObjectStore,forceCloseDatabase} from 'fake-indexeddb';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {jointHandoverReassociationPlan,jointHandoverReassociationChoice,handoverReassociationPredecessorChoice} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_identity.js';
import {JointHandoverReassociationIntentStore as Store,JointReassociationIntentStore as Ordinary,jointReassociationPublicationBinding as binding} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/intent_store.js';
import {persistHandoverReassociation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_persist.js';
import {prepareJointHandoverReassociation,resumeJointHandoverReassociationPreparation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_prepare.js';
import {ColdJointRoomActivationAttempt,prepareColdJointHandoverRestart,resumeColdJointHandoverRestartPreparation} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import {RoomHandoverActivationIntentStore as NativeStore} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {prepareHeldHandoverActivationReassociation,resumeHeldHandoverActivationReassociation} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import {withHandoverActivationControls} from './fixtures/native-activation/handover-controls.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {databaseByteSnapshot} from './fixtures/native-actor-custody/storage_bytes.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const options=()=>({wasm:native,checkAuthority(){}});
const code=expected=>error=>error?.code===expected;
const policy=code('joint_activation_intent_policy');
const integrity=code('joint_activation_intent_integrity');
const namespace=name=>indexedDB.databases().then(rows=>rows.some(row=>row.name===name));
let root,continued,directory,reset;
before(async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 directory=process.env.BREDITOR_SEALED_RESTART_CHOICES;
 assert.ok(directory,'Select the output directory of the actual sealed whole-room fixture');
 const read=suffix=>JSON.parse(readFileSync(join(directory,'actual-joint-complete-'+suffix+'.json'),'utf8'));
 root=read('independent-plan');
 continued=read('continued-choice');
 const bytes=JSON.stringify(root.plan);
 assert.equal(root.bytes,Buffer.byteLength(bytes));
 assert.equal(root.sha256,digest(bytes));
});
beforeEach(()=>{reset=environment();});
afterEach(()=>reset());

function draft(tag,{previous,child=false,evidence=false}={}){
 const prior=previous?.plan??root.plan;
 const activation=structuredClone(prior.activation);
 activation.database=tag+'-native';
 activation.activation.instance=digest(tag+'-native-instance');
 activation.handover.current.instance=digest(tag+'-path-instance');
 if(child){
  const wire=activation.activation;
  wire.previous=structuredClone(wire.planned);
  wire.planned={...wire.planned,generation:String(BigInt(wire.planned.generation)+1n),owner:digest(tag+'-child-owner')};
  wire.checkpointSha256=[...Buffer.from(digest(tag+'-checkpoint'),'hex')];
 }
 const predecessors=[];
 if(previous){
  const {format,formatVersion,original,predecessors:earlier,...record}=structuredClone(previous.plan);
  predecessors.push(...earlier,{...record,bytes:previous.bytes,sha256:previous.sha256});
 }
 const priorMetadata=evidence
  ?{format:'breditor/handover-metadata-continuation-evidence',formatVersion:1,choice:structuredClone(continued),phase:'intent',review:null,metadata:null}
  :{format:'breditor/metadata-continuation-absence',formatVersion:1,destinations:structuredClone(prior.destinations)};
 return{format:'breditor/joint-native-handover-reassociation-plan',formatVersion:1,database:tag+'-intent',original:structuredClone(root),predecessors,
  activation,publication:{...structuredClone(prior.publication),instance:digest(tag+'-publication-instance'),activation:structuredClone(activation.activation)},
  destinations:{database:tag+'-continuation',preparationDatabase:tag+'-preparation',reviewDatabase:tag+'-review',metadataDatabase:tag+'-metadata'},prior:priorMetadata};
}
function select(input){
 const plan=jointHandoverReassociationPlan(input),text=JSON.stringify(plan);
 return jointHandoverReassociationChoice({format:'breditor/joint-native-handover-reassociation-intent',formatVersion:1,plan,bytes:Buffer.byteLength(text),sha256:digest(text)});
}
const open=async(choice,create=false)=>{
 const store=new Store(choice,options());
 try{return await store.open(create);}finally{await store.close();}
};

function originalEncoding(){
 const base=join(directory,'actual-joint-prepared-native-intent-evidence');
 const choice=root.plan.activation;
 assert.deepEqual(JSON.parse(readFileSync(join(base,'choice.json'),'utf8')),choice);
 const read=(name,pin)=>{
  const bytes=readFileSync(join(base,name));
  assert.equal(bytes.length,pin.bytes);
  assert.equal(digest(bytes),pin.sha256);
  return bytes;
 };
 const graph=read('graph.json',choice.graph).toString('utf8');
 const objects=choice.objects.map(pin=>new Blob([read(pin.sha256+'.bin',pin)]));
 return {choice,graph,objects};
}

test('the real original choice binds fresh sealed controllers and a linear direct-child checkpoint',async()=>{
 const first=select(draft('first',{evidence:true}));
 const child=select(draft('child',{previous:first,child:true}));
 assert.deepEqual(first.plan.original,root);
 assert.deepEqual(first.plan.activation.graph,root.plan.activation.graph);
 assert.deepEqual(first.plan.activation.objects,root.plan.activation.objects);
 assert.deepEqual(first.plan.prior.choice,continued);
 assert.deepEqual(child.plan.activation.activation.previous,first.plan.activation.activation.planned);
 assert.deepEqual(handoverReassociationPredecessorChoice(child.plan,0),first);
 assert.equal((await open(child,true)).phase,'prepared');
 assert.equal((await open(child)).receipt,null);
});

test('a new descriptor refuses namespace aliases, foreign seal evidence and changed activation or publication pins',()=>{
 const first=select(draft('selected'));
 for(const change of [
  plan=>{plan.database=root.plan.sourceNamespaces[0];},
  plan=>{plan.destinations.reviewDatabase=first.plan.destinations.reviewDatabase;},
  plan=>{plan.activation.graph.sha256=digest('changed literal graph');},
  plan=>{plan.activation.handover.current.instance=first.plan.activation.handover.current.instance;},
  plan=>{plan.activation.handover.current.instance=root.plan.activation.handover.current.instance;},
  plan=>{plan.activation.handover.path.seal.owner=digest('foreign seal');},
  plan=>{plan.publication.activation.instance=digest('foreign Native activation');},
  plan=>{plan.publication.instance=root.plan.publication.instance;},
  plan=>{plan.publication.listener='127.0.0.1:1234';},
  plan=>{plan.prior.destinations.database='another-continuation';},
 ]){
  const raw=draft('refused',{previous:first,child:true});
  change(raw);
  assert.throws(()=>select(raw),policy);
 }
 for(const change of [
  plan=>{plan.prior.choice.handover.path.seal.owner=digest('foreign evidence seal');},
  plan=>{plan.prior.choice.continuation.origin.metadata.sha256=digest('foreign source facts');},
  plan=>{plan.prior.phase='absent';},
 ]){
  const raw=draft('refused-evidence',{evidence:true});
  change(raw);
  assert.throws(()=>select(raw),policy);
 }
});

test('the journal refuses changed original or predecessor digests and invalid saved journal bodies before creating anything',async()=>{
 const first=select(draft('pin-parent'));
 const badRoot=draft('wrong-original');
 badRoot.original.sha256=digest('changed original');
 const badPredecessor=draft('wrong-predecessor',{previous:first,child:true});
 badPredecessor.predecessors[0].sha256=digest('changed predecessor');
 const badJournal=draft('wrong-journal',{evidence:true});
 badJournal.prior.phase='review';
 badJournal.prior.review='{}';
 for(const [raw,error] of [[badRoot,integrity],[badPredecessor,integrity],[badJournal,undefined]]){
  await assert.rejects(open(select(raw),true),error);
  assert.equal(await namespace(raw.database),false);
 }
});

test('a sealed publication observation is exact and a cold retry cannot reset or overwrite it',async()=>{
 const choice=select(draft('observed')),store=new Store(choice,options());
 try{
  const selected=await store.open(true);
  assert.equal(selected.format,'breditor/joint-native-handover-reassociation-state');
  const receipt={format:'breditor/native-room-publication-receipt',formatVersion:1,selection:choice.plan.publication,joint:binding(choice),scope:'actual-held-native-service-and-bound-listener; joint-association-only'};
  await assert.rejects(store.markPublicationObserved(receipt),policy);
  await store.markPublicationStarted();
  const other=structuredClone(receipt);
  other.joint.sha256[0]^=1;
  await assert.rejects(store.markPublicationObserved(other));
  assert.deepEqual((await store.markPublicationObserved(receipt)).receipt,receipt);
 }finally{await store.close();}
 const original=await databaseByteSnapshot(choice.plan.database);
 await assert.rejects(open(choice,true),code('joint_activation_intent_exists'));
 assert.throws(()=>new Ordinary(choice,options()),policy);
 assert.equal((await open(choice)).phase,'receipt-observed');
 assert.deepEqual(await databaseByteSnapshot(choice.plan.database),original);
});

test('revoking the selected connection ends its journal guard and leaves the exact sealed choice retryable',async()=>{
 const choice=select(draft('revoked')),store=new Store(choice,options());
 const openDatabase=IDBFactory.prototype.open;
 let connection;
 try{
  IDBFactory.prototype.open=function(...args){
   const request=openDatabase.apply(this,args);
   if(args[0]===choice.plan.database)request.addEventListener('success',()=>{connection=request.result;},{once:true});
   return request;
  };
  await store.open(true);
  assert.ok(connection);
  forceCloseDatabase(connection);
  await new Promise(resolve=>setImmediate(resolve));
  assert.throws(store.check,code('joint_activation_intent_closed'));
 }finally{
  IDBFactory.prototype.open=openDatabase;
  await store.close();
 }
 assert.equal((await open(choice)).phase,'prepared');
});

test('an interrupted paired write retains exact Native bytes and resumes the missing journal without controllers',async()=>{
 const choice=select(draft('paired-retry',{child:true,evidence:true}));
 const encoding=originalEncoding(),source=new NativeStore(encoding.choice,options());
 try{
  await source.open(encoding);
  const original=await databaseByteSnapshot(encoding.choice.database);
  let retained,interrupted=false;
  const add=IDBObjectStore.prototype.add;
  try{
   IDBObjectStore.prototype.add=function(...args){
    const result=add.apply(this,args);
    if(!interrupted&&this.transaction.db.name===choice.plan.database){
     interrupted=true;
     this.transaction.abort();
    }
    return result;
   };
   await withHandoverActivationControls({handover:choice.plan.activation.handover},choice.plan.activation.activation,async controllers=>{
    await assert.rejects(persistHandoverReassociation(choice,options(),false,async()=>{
     await prepareHeldHandoverActivationReassociation(source,{
      previous:encoding.choice,database:choice.plan.activation.database,activation:controllers.activation,path:controllers.path,
      async retainChoice(actual){
       assert.deepEqual(actual,choice.plan.activation);
       assert.equal(await namespace(actual.database),false);
       assert.equal(await namespace(choice.plan.database),false);
       retained=choice;
      },
     },options());
    }),()=>interrupted);
    assert.equal(controllers.requests.length,0);
   });
  }finally{IDBObjectStore.prototype.add=add;}
  assert.equal(interrupted,true);
  assert.deepEqual(retained,choice);
  assert.equal(await namespace(choice.plan.database),false);
  const exactNative=await databaseByteSnapshot(choice.plan.activation.database);
  const retry=()=>persistHandoverReassociation(retained,options(),true,async()=>{
   await resumeHeldHandoverActivationReassociation(source,{previous:encoding.choice,expected:retained.plan.activation},options());
  });
  assert.deepEqual(await retry(),retained);
  assert.deepEqual(await retry(),retained);
  assert.equal((await open(choice)).phase,'prepared');
  assert.deepEqual(await databaseByteSnapshot(choice.plan.activation.database),exactNative);
  assert.deepEqual(await databaseByteSnapshot(encoding.choice.database),original);
 }finally{await source.close();}
});

test('an invalid complete pin or an orphaned journal cannot write the Native destination',async()=>{
 const choice=select(draft('pair-refusal'));
 let writes=0;
 const write=async()=>{writes++;};
 await assert.rejects(persistHandoverReassociation({...choice,sha256:digest('tampered pair pin')},options(),true,write),integrity);
 assert.equal(await namespace(choice.plan.database),false);
 await open(choice,true);
 await assert.rejects(persistHandoverReassociation(choice,options(),true,write),code('joint_activation_intent_exists'));
 assert.equal(await namespace(choice.plan.activation.database),false);
 assert.equal(writes,0);
});

test('a forged cold origin cannot select or retry a sealed restart before actual admission',async()=>{
 let reflections=0;
 const poison=new Proxy({},{ownKeys(){reflections++;throw Error('Unexpected input reflection');}});
 const forged=Object.freeze({choice:root,check(){reflections++;}});
 await assert.rejects(prepareJointHandoverReassociation({},forged,poison,poison),code('joint_activation_state'));
 await assert.rejects(resumeJointHandoverReassociationPreparation({},forged,poison,poison,()=>{reflections++;}),code('joint_activation_state'));
 const copied=Object.create(ColdJointRoomActivationAttempt.prototype);
 await assert.rejects(prepareColdJointHandoverRestart(copied,poison),policy);
 await assert.rejects(resumeColdJointHandoverRestartPreparation(copied,poison,()=>{reflections++;}),policy);
 assert.equal(reflections,0);
});
