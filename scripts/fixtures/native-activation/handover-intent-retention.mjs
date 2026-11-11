/** Persist a complete ACTUAL handover capture. The activation target below is
 * inert test DATA, independently labelled; this fixture sends no activation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {selection} from './transport.mjs';
import {encodeRoomHandoverActivationIntent as encode} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/encode.js';
import {decodeRoomHandoverActivationIntent as decode} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/decode.js';
import {RoomHandoverActivationIntentStore as Store} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import * as native from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function retainActualHandoverActivationData({scope,sources,metadata,host,fresh,check}){
 const before=metadata.recovery(),stamps=sources.map(row=>coreReadStamp(row.source.core));
 const unchanged=()=>{check();scope.check();assert.deepEqual(metadata.recovery().before,before.before);assert.deepEqual(metadata.recovery().current.lanes.map(row=>row.records),before.current.lanes.map(row=>row.records));assert.deepEqual(sources.map(row=>coreReadStamp(row.source.core)),stamps);};
 const capture=await metadata.captureReconciledServerPacketRecoveryAcrossHandover({host:fresh.delivery,path:fresh.path,server:fresh.server,inventory:fresh.inventory,transport:fresh.delivery});unchanged();
 assert.deepEqual(capture.handover,fresh.path.handoverSelection());assert.equal(capture.capture.reconciliation.kind,'checked');assert.equal(capture.capture.recovery.kind,'retained');assert.equal(capture.capture.recovery.bundle.assets.kind,'retained');
 const activation=selection(capture.capture.reconciliation.sources.native.selection.source);
 const held=()=>{check();scope.check();for(let i=0;i<sources.length;i++){const now=coreReadStamp(sources[i].source.core);assert.equal(now.document,stamps[i].document);assert.equal(now.review,stamps[i].review);}};
 const options={wasm:native,checkAuthority:held,signal:scope.signal};
 const encoded=await encode('actual-handover-activation-data-intent',activation,capture.handover,capture,options);unchanged();
 const a=new Store(encoded.choice,options);
 try{const warm=await a.open(encoded);assert.deepEqual(warm.capture.handover,capture.handover);assert.equal(warm.state.phase,'prepared');}finally{await a.close();}
 unchanged();
 const b=new Store(encoded.choice,options);let retained;
 try{retained=await b.open();assert.deepEqual(retained.choice,encoded.choice);assert.deepEqual(retained.capture.handover,capture.handover);assert.equal(retained.state.phase,'prepared');}finally{await b.close();}
 unchanged();
 // The graph is the wire contract, including every literal fact and Blob MIME
 // tag. Node's own Blob constructor/species properties are implementation data.
 const cold=await encode(encoded.choice.database,encoded.choice.activation,encoded.choice.handover,retained.capture,options);unchanged();
 assert.deepEqual(cold.choice,encoded.choice);assert.ok(cold.graph===encoded.graph,'Cold intent changed the literal tagged graph or Blob MIME tags');
 for(let i=0;i<cold.objects.length;i++){
  const actual=Buffer.from(await cold.objects[i].arrayBuffer()),expected=Buffer.from(await encoded.objects[i].arrayBuffer());unchanged();
  assert.ok(actual.equals(expected),'Cold intent changed object bytes at index '+i);
 }
 const directory=join(host.directory,'actual-handover-activation-data-intent');mkdirSync(directory,{mode:0o700});
 const files=[],save=(name,data)=>{writeFileSync(join(directory,name),data,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(join(directory,name)),data);files.push({name,bytes:data.length,sha256:sha(data)});};
 save('choice.json',Buffer.from(JSON.stringify(encoded.choice)));save('graph.json',Buffer.from(encoded.graph));save('state.json',Buffer.from(JSON.stringify(retained.state)));
 for(let i=0;i<encoded.objects.length;i++){const bytes=Buffer.from(await encoded.objects[i].arrayBuffer());unchanged();assert.equal(sha(bytes),encoded.choice.objects[i].sha256);save(encoded.choice.objects[i].sha256+'.bin',bytes);}
 const diskChoice=JSON.parse(readFileSync(join(directory,'choice.json'))),graph=readFileSync(join(directory,'graph.json'),'utf8'),objects=diskChoice.objects.map(pin=>new Blob([readFileSync(join(directory,pin.sha256+'.bin'))]));
 const disk=await decode({choice:diskChoice,graph,objects},options);unchanged();assert.deepEqual(disk.handover,capture.handover);assert.deepEqual(disk.capture.binding,capture.capture.binding);
 const report={format:'breditor/actual-handover-activation-intent-data-evidence',formatVersion:1,directory,files,sourceParticipants:7,originalFactsPreserved:true,completeIntentColdReadback:true,completeDiskReadback:true,syntheticActivationSelection:true,actualActivationRequested:false,wholeRoomActivated:false};
 save('index.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
 console.log('HANDOVER_ACTIVATION_INTENT_DATA_NATIVE '+JSON.stringify(report));
}
