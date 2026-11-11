/** Controlled wire laws for the explicit historical handover admission. Real
 * Native/client replay is proved by the complete source/installed workflow. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {transportFixture} from './fixtures/server-generation-archive/transport.mjs';
import {withHandoverActivationControls as using} from './fixtures/native-activation/handover-controls.mjs';
import {withRecordedBaseHandoverInspection as held,recordedBaseProviderSelection as admit} from '../packages/breditor-collaboration/dist/server_packet_recovery/recorded_base_control.js';
import {roomHandoverActivationIntentChoice as choose} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/identity.js';
import {handoverActivationReassociationChoice as reassociate} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate_choice.js';
function fixture(){
 const earlier=transportFixture().expected,next=structuredClone(earlier);next.native.source.records++;next.native.manifest[0]^=1;
 const source={origin:next,server:next,participants:{source:next.native,sha256:Array(32).fill(4)}},native={format:'breditor/server-log-generation-recovery-control',formatVersion:1,instance:'b'.repeat(64),source};
 const delivery={format:'breditor/server-log-generation-delivery-recovery-control',formatVersion:1,instance:'c'.repeat(64),continuation:{format:'breditor/server-log-generation-delivery-continuation',formatVersion:1,previous:next,current:source},current:native};
 const successor={format:'breditor/server-log-generation-delivery-path',formatVersion:1,ancestors:[next],current:source},current={format:'breditor/server-log-generation-delivery-path-recovery-control',formatVersion:1,instance:'d'.repeat(64),path:successor,current:delivery};
 const seal={identity:{format:'breditor/room-deployment-authority',formatVersion:1,authority:'e'.repeat(64),binding:'f'.repeat(64)},generation:'2',owner:'a'.repeat(64)};
 const handover={format:'breditor/server-log-generation-handover-delivery-path-recovery-control',formatVersion:1,path:{format:'breditor/server-log-generation-handover-delivery-path',formatVersion:1,seal,earlier:[earlier],successor},current};
 const activation={format:'breditor/durable-native-activation-control',formatVersion:1,instance:'1'.repeat(64),checkpointSha256:Array(32).fill(1),current:source,previous:seal,planned:{...seal,generation:'3',owner:'2'.repeat(64)}};
 return {capture:{handover},activation,control:{kind:'native-continuation',selection:delivery},catalog:{origin:{identity:earlier},current:{server:{identity:earlier}}},ordinary:{origin:{identity:next},current:{server:{identity:next}}},next};
}
async function run(visit){const f=fixture();return using(f.capture,f.activation,c=>visit(f,c));}
function restarted(f){
 const live=structuredClone(f.capture.handover);
 live.current.instance='3'.repeat(64);
 live.current.current.instance='4'.repeat(64);
 live.current.current.current.instance='5'.repeat(64);
 live.path.successor.ancestors.push(f.next);
 return live;
}
function advancingPredecessor(){
 const f=fixture();
 const advance=count=>{
  const cut=structuredClone(f.next);
  cut.native.source.records+=count;
  cut.native.manifest[0]^=count;
  cut.archiveSha256[0]^=count;
  return cut;
 };
 const previous=advance(1),fresh=advance(2),current=advance(3);
 f.activation.current.server=current;
 f.activation.current.participants.source=current.native;
 f.control.selection.continuation.previous=previous;
 const recorded=f.capture.handover,live=restarted(f);
 live.current.current.continuation.previous=fresh;
 live.path.successor.ancestors.push(fresh);
 const original=choose({format:'breditor/room-native-handover-activation-intent',formatVersion:1,database:'original-handover',
  activation:f.activation,handover:recorded,graph:{bytes:1,sha256:'a'.repeat(64)},objects:[],totalBytes:1});
 return {f,recorded,live,previous,original,restartedActivation:{...f.activation,instance:'7'.repeat(64)}};
}
test('ordinary base inspection preserves its exact original restore-origin rule',()=>run(async(f)=>{
 assert.deepEqual(admit(f.control,f.ordinary),f.control.selection.current);assert.throws(()=>admit(f.control,f.catalog));
}));
test('a genuine authenticated sealed path admits the recorded catalog before handover',()=>run(async(f,c)=>{
 await held(c.path,undefined,()=>{},async proof=>assert.deepEqual(admit(f.control,f.catalog,proof),f.control.selection.current));assert.equal(c.requests.length,0);
}));
test('detached path data, copied proofs and an expired visit cannot admit a catalog',()=>run(async(f,c)=>{
 let proof;await held(c.path,undefined,()=>{},async value=>{proof=value;assert.throws(()=>admit(f.control,f.catalog,{...value}));});
 assert.throws(()=>admit(f.control,f.catalog,proof));let visits=0;await assert.rejects(held({...c.path},undefined,()=>{},async()=>{visits++;}));assert.equal(visits,0);
}));
test('handover admission refuses a changed provider instance or an omitted catalog cut',()=>run(async(f,c)=>{
 await held(c.path,undefined,()=>{},async proof=>{
  assert.throws(()=>admit({...f.control,selection:{...f.control.selection,instance:'9'.repeat(64)}},f.catalog,proof));
  const absent=structuredClone(f.next);absent.native.manifest[1]^=1;
  assert.throws(()=>admit(f.control,{...f.catalog,current:{server:{identity:absent}}},proof));
 });
}));
test('fresh sealed controls recheck the original recorded provider without rewriting its selection',async()=>{
 const f=fixture(),live=restarted(f),recorded=f.capture.handover;
 await using({handover:live},f.activation,async c=>{
  await held(c.path,undefined,()=>{},async proof=>assert.throws(()=>admit(f.control,f.catalog,proof)));
  await held(c.path,undefined,()=>{},async proof=>{
   assert.deepEqual(admit(f.control,f.catalog,proof),f.control.selection.current);
   assert.throws(()=>admit({...f.control,selection:live.current.current},f.catalog,proof));
  },recorded);
  assert.equal(c.requests.length,0);
 });
});
test('a new controller cannot substitute a different seal or omit a recorded cut',async()=>{
 const f=fixture(),recorded=f.capture.handover;
 const changes=[
  live=>{live.path.seal.owner='6'.repeat(64);},
  live=>{live.path.successor.ancestors=live.path.successor.ancestors.map(cut=>({...cut,archiveSha256:Array(32).fill(6)}));},
 ];
 for(const change of changes){
  const live=restarted(f);change(live);
  await using({handover:live},f.activation,async c=>{
   let visits=0;
   await assert.rejects(held(c.path,undefined,()=>{},async()=>{visits++;},recorded),{code:'metadata_packet_retention_state'});
   assert.equal(visits,0);
  });
 }
});
test('an advanced predecessor admits the saved provider when the live path includes the original predecessor',async()=>{
 const {f,recorded,live,previous,original,restartedActivation}=advancingPredecessor();
 live.path.successor.ancestors.splice(-1,0,previous);
 const choice=reassociate(original,'complete-restart',restartedActivation,live);
 assert.deepEqual(choice.graph,original.graph);
 await using({handover:live},restartedActivation,async c=>{
  await held(c.path,undefined,()=>{},async proof=>{
   assert.deepEqual(admit(f.control,f.catalog,proof),f.control.selection.current);
  },recorded);
  assert.equal(c.requests.length,0);
 });
});
test('a replacement with an unproved original predecessor is refused before retaining a restart choice',async()=>{
 const {f,recorded,live,original,restartedActivation}=advancingPredecessor();
 assert.throws(()=>reassociate(original,'incomplete-restart',restartedActivation,live),{code:'activation_intent_stale'});
 await using({handover:live},restartedActivation,async c=>{
  let visits=0;
  await assert.rejects(held(c.path,undefined,()=>{},async()=>{visits++;},recorded),{code:'metadata_packet_retention_state'});
  assert.equal(visits,0);
  assert.equal(c.requests.length,0);
 });
});
test('ending a nested controller revokes the same-visit handover admission',()=>run(async(f,c)=>{
 await assert.rejects(held(c.path,undefined,()=>{},async proof=>{c.close('native');assert.throws(()=>admit(f.control,f.catalog,proof));}));assert.equal(c.requests.length,0);
}));
test('an aborted handover visit never enters client inspection',()=>run(async(f,c)=>{
 const controller=new AbortController();controller.abort();let visits=0;await assert.rejects(held(c.path,controller.signal,()=>{},async()=>{visits++;}));assert.equal(visits,0);
}));
