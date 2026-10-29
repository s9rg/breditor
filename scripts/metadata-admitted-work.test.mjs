/** Normal Wasm and genuine native reservations; per-call work is scheduling only.
 * These laws do not grant transport authentication or prove packet settlement. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {SharedRichEditor,reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';
import {RelayWorkCustody,waitRetiredRelayWork} from '../packages/breditor-collaboration/dist/relay/work_custody.js';
import {nativeRecoveryWorkAdmission as admission} from '../packages/breditor-collaboration/dist/native_recovery/work_admission.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const profile=native.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/admitted-metadata-work',version:1},extensions:[]})),descriptor=JSON.parse(profile.descriptor_json());
const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[]}]}});
const fail=()=>Object.assign(Error('Exact per-call work admission required'),{code:'work_refused'}),refused=e=>e?.code==='work_refused',busy=e=>e?.code==='native_recovery_busy',core=writer=>new SharedRichEditor(profile.create(document,writer??'101'));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
test.after(()=>profile.free());
test('an admitted job never promotes its ordinary store or ordinary reentrant callbacks',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a);
 try{await work.runAdmitted(grant,async()=>{assert.throws(()=>work.runSync(()=>{}),refused);assert.throws(()=>work.run(()=>Promise.resolve()),refused);assert.throws(()=>a.select(null),busy);assert.throws(()=>held.close(),busy);});assert.throws(()=>work.runSync(()=>{}),refused);held.close();assert.equal(work.runSync(()=>42),42);}finally{work.retire(()=>{});held.close();a.dispose();}
});
test('synchronous admitted staging retains native exclusion only through that exact call',()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a);let ended=false;
 try{assert.equal(work.runSyncAdmitted(grant,()=>{assert.equal(work.hasPendingWork(),true);assert.throws(()=>held.close(),busy);assert.throws(()=>work.runSync(()=>{}),refused);ended=true;return 7;}),7);assert.equal(ended,true);assert.equal(work.hasPendingWork(),false);held.close();}finally{work.retire(()=>{});held.close();a.dispose();}
});
test('copied and foreign-core admission refuses before the first callback',()=>{
 const a=core(),b=core('102'),wa=new RelayWorkCustody(a,()=>true,fail),wb=new RelayWorkCustody(b,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a);let calls=0;
 try{for(const start of [()=>wa.runAdmitted({...grant},async()=>{calls++;}),()=>wa.runSyncAdmitted({...grant},()=>{calls++;}),()=>wb.runAdmitted(grant,async()=>{calls++;}),()=>wb.runSyncAdmitted(grant,()=>{calls++;})])assert.throws(start,refused);assert.equal(calls,0);assert.equal(wa.hasPendingWork(),false);held.close();}finally{wa.retire(()=>{});wb.retire(()=>{});held.close();a.dispose();b.dispose();}
});
test('an ended grant cannot be revived during a later native reservation',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a);held.close();let next;
 try{assert.throws(()=>work.runAdmitted(grant,async()=>{}),refused);next=reserveNativeRecovery([a]);assert.throws(()=>work.runSyncAdmitted(grant,()=>{}),refused);await work.runAdmitted(admission(next,a),async()=>{});next.close();}finally{work.retire(()=>{});next?.close();a.dispose();}
});
test('retirement keeps the actual source attachment and native exclusion until every admitted promise settles',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a),first=deferred(),second=deferred();let detached=false,drained=false;
 const p=work.runAdmitted(grant,()=>first.promise),q=work.runAdmitted(grant,()=>second.promise);
 try{work.retire(()=>{detached=true;});const retiring=waitRetiredRelayWork(a).then(()=>{drained=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(drained,false);assert.equal(detached,false);assert.throws(()=>held.close(),busy);first.resolve();await p;assert.equal(detached,false);assert.equal(drained,false);assert.throws(()=>held.close(),busy);second.resolve();await q;await retiring;assert.equal(detached,true);assert.equal(drained,true);held.close();}finally{first.resolve();second.resolve();await Promise.allSettled([p,q]);work.retire(()=>{});held.close();a.dispose();}
});
test('synchronous and asynchronous failures release only the finished job',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a),error=Error('Original failure');
 try{assert.throws(()=>work.runSyncAdmitted(grant,()=>{throw error;}),e=>e===error);assert.equal(work.hasPendingWork(),false);await assert.rejects(work.runAdmitted(grant,()=>{throw error;}),e=>e===error);await assert.rejects(work.runAdmitted(grant,async()=>{throw error;}),e=>e===error);assert.equal(work.hasPendingWork(),false);held.close();}finally{work.retire(()=>{});held.close();a.dispose();}
});
test('retiring inside a staging callback cannot detach or release the job early',()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a);let detached=false;
 try{work.runSyncAdmitted(grant,()=>{work.retire(()=>{detached=true;});assert.equal(detached,false);assert.throws(()=>held.close(),busy);});assert.equal(detached,true);assert.throws(()=>work.runSyncAdmitted(grant,()=>{}),refused);held.close();}finally{work.retire(()=>{});held.close();a.dispose();}
});
test('an unrelated job failure cannot release a still-pending admitted callback',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a),late=deferred(),pending=work.runAdmitted(grant,()=>late.promise);
 try{await assert.rejects(work.runAdmitted(grant,async()=>{throw Error('Other job failed');}));assert.throws(()=>held.close(),busy);assert.equal(work.hasPendingWork(),true);late.resolve();await pending;assert.equal(work.hasPendingWork(),false);held.close();}finally{late.resolve();await pending;work.retire(()=>{});held.close();a.dispose();}
});

test('an accidentally asynchronous staging callback refuses but retains its real promise until source retirement drains',async()=>{
 const a=core(),work=new RelayWorkCustody(a,()=>true,fail),held=reserveNativeRecovery([a]),grant=admission(held,a),late=deferred();let detached=false;
 try{assert.throws(()=>work.runSyncAdmitted(grant,()=>late.promise),refused);assert.equal(work.hasPendingWork(),true);work.retire(()=>{detached=true;});assert.equal(detached,false);assert.throws(()=>held.close(),busy);late.resolve();await waitRetiredRelayWork(a);assert.equal(detached,true);held.close();}finally{late.resolve();await work.wait(()=>{});work.retire(()=>{});held.close();a.dispose();}
});
