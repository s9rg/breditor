/** Controlled wire laws for the explicit historical handover admission. Real
 * Native/client replay is proved by the complete source/installed workflow. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {transportFixture} from './fixtures/server-generation-archive/transport.mjs';
import {withHandoverActivationControls as using} from './fixtures/native-activation/handover-controls.mjs';
import {withRecordedBaseHandoverInspection as held,recordedBaseProviderSelection as admit} from '../packages/breditor-collaboration/dist/server_packet_recovery/recorded_base_control.js';
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
test('ending a nested controller revokes the same-visit handover admission',()=>run(async(f,c)=>{
 await assert.rejects(held(c.path,undefined,()=>{},async proof=>{c.close('native');assert.throws(()=>admit(f.control,f.catalog,proof));}));assert.equal(c.requests.length,0);
}));
test('an aborted handover visit never enters client inspection',()=>run(async(f,c)=>{
 const controller=new AbortController();controller.abort();let visits=0;await assert.rejects(held(c.path,controller.signal,()=>{},async()=>{visits++;}));assert.equal(visits,0);
}));
