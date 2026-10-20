/** Genuine native original/mixed cohorts. Replacing a readonly binding is
 * unsupported and must refuse before entering the replacement accessor. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {originalOperation} from './fixtures/operation-cohort/original-participant.mjs';
import {databaseSnapshot} from './fixtures/operation-cohort/snapshot.mjs';
export async function probeManagedSourceBindings(directory,manifestPath){
 const api=await import('../packages/breditor-collaboration/dist/index.js'),rich=await import('../packages/breditor-experimental-rich-content/index.js'),base=import.meta.resolve('@breditor/collaboration'),{prepareRoomParticipants}=await import(new URL('./room_operation/custody.js',base).href),{prepareMixedRoomParticipants}=await import(new URL('./mixed_room_operation/custody.js',base).href);
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,sourceFamilies:0,cohorts:0,participants:0,refusals:0,preparedRefusals:0,authorityRefusals:0,destructorRefusals:0,accessorInvocations:0,coldParticipants:0,fileComparisons:0,storedRecordComparisons:0,historyComparisons:0,uploadComparisons:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0,networkCalls:0,restoredParticipants:0,restoredComponents:0},failures=[];
 for(const [roomIndex,item]of manifest.cases.entries()){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),factory=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`,profile=wasm.SharedRichProfile[factory](fixture.configuration);
  try{for(const [family,kind]of [['original','local'],['mixed','local'],['mixed','relay'],['mixed','retained']])for(const timing of ['prepared','authority','destructor']){
   const restoreEnvironment=environment(),held=[],restore=profile.restore;let cap,escaped,target,descriptor,armed=false,installed=false,calls=0,retired=false,guardCalls=0;
   const install=()=>{if(installed)return;installed=true;const core=target.core,victim=(family==='original'?held[0].parts.session:held[1].session).core;descriptor=Object.getOwnPropertyDescriptor(target,'core');assert.equal(descriptor.configurable,true);Object.defineProperty(target,'core',{configurable:true,get(){calls++;if(!retired&&new Error().stack.includes('checkManagedRecoveryOwners')){retired=true;victim.retire();}return core;}});};
   profile.restore=function(...args){const raw=restore.apply(this,args),free=raw.free;raw.free=function(...args){free.apply(this,args);if(armed&&timing==='destructor')install();};return raw;};
   try{
    const tag=`binding-${roomIndex}-${family}-${kind}-${timing}`;
    held.push(await originalOperation({api,rich,profile,fixture,client:fixture.clients[0],tag:tag+'-first',counts}));
    if(family==='original')held.push(await originalOperation({api,rich,profile,fixture,client:fixture.clients[1],tag:tag+'-last',counts}));
    else{const h=await generationParticipant({api,rich,profile,fixture,client:fixture.clients[1],kind,tag:tag+'-generation',counts});held.push(h);await h.holdOperation();}
    counts.participants+=2;target=held[family==='original'?1:0].parts.session;
    const values=held.map((h,index)=>({id:'p'+index,...(family==='mixed'?{family:index===0?'original':'generation'}:{}),operation:h.operation})),names=[...new Set(held.flatMap(h=>[h.operationResume.database,h.operationResume.recoveryDatabase,...Object.values(h.operationResume.destinations)]))],before=new Map(await Promise.all(names.map(async name=>[name,await databaseSnapshot(name)]))),files=await Promise.all(held.map(async h=>new Uint8Array(await h.backup.file().arrayBuffer())));
    cap=await(family==='original'?prepareRoomParticipants:prepareMixedRoomParticipants)(values,[],[],async()=>{},()=>{if(++guardCalls===2&&timing==='authority')install();},()=>{});
    if(timing==='prepared')install();armed=true;let error;try{escaped=cap.commit();}catch(e){error=e;}finally{armed=false;}
    assert.equal(installed,true);assert.equal(calls,0,'Managed validation must not evaluate a replacement accessor');assert.equal(escaped===undefined,true,'No participant escapes a replaced binding');assert.equal(error?.code,'managed_source_unavailable');assert.equal(retired,false);counts.refusals++;counts[timing+'Refusals']++;
    Object.defineProperty(target,'core',descriptor);descriptor=undefined;
    for(const name of names){assert.deepEqual(await databaseSnapshot(name),before.get(name));counts.storedRecordComparisons++;}
    for(const[index,h]of held.entries()){
     assert.deepEqual(new Uint8Array(await h.backup.file().arrayBuffer()),files[index]);counts.fileComparisons++;
     const expected=h.exportRecovery(),uploads=await databaseSnapshot(h.operationResume.destinations.uploads);await h.coldOperation();h.takeParts(await h.operation.intoParts());assert.deepEqual(h.exportRecovery(),expected);counts.historyComparisons++;counts.coldParticipants++;assert.deepEqual(await databaseSnapshot(h.operationResume.destinations.uploads),uploads);counts.uploadComparisons++;
     const core=(h.parts?h.parts.session:h.session).core;
     if(!h.readOnly){const reference=new api.SharedRichEditor(h.parts?profile.restore(h.options.room,core.checkpointJson()):profile.restore_segmented(h.options.room,core.checkpointJson()),h.parts?{}:{segmentedHistory:'segmented-v1'});try{reference.enableReview(h.options.review,core.reviewCheckpoint());for(const method of ['redo','undo']){assert.equal(core[method](),reference[method]());assert.equal(core.checkpointJson(),reference.checkpointJson());counts.futureDocumentCheckpoints++;core[method+'Review']();reference[method+'Review']();assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewCheckpoints++;}}finally{reference.dispose();}}
     else assert.equal(core.view().readOnly,true);
    }
    counts.accessorInvocations+=calls;counts.cohorts++;if(family==='mixed'&&timing==='destructor')counts.sourceFamilies++;
   }catch(error){failures.push({roomIndex,family,kind,timing,installed,calls,retired,escaped:!!escaped,code:error.code??null,message:String(error)});}finally{armed=false;if(descriptor)Object.defineProperty(target,'core',descriptor);cap?.abandon();if(escaped)for(const[index,value]of escaped.participants.entries())held[index].takeParts(value.parts);try{for(const h of [...held].reverse())await h.close();}finally{profile.restore=restore;restoreEnvironment();}}
  }counts.nativeRooms++;}finally{profile.free();}
 }
 // Flush the whole diagnostic before an uncaught exception writes its stack.
 // Large console.error writes can otherwise be cut/interleaved at process exit.
 if(failures.length){await new Promise((resolve,reject)=>process.stderr.write('MANAGED_SOURCE_BINDING_FAILURES '+JSON.stringify(failures)+'\n',error=>error?reject(error):resolve()));throw Error('Managed source binding assertions failed');}
 for(const[key,value]of Object.entries({nativeRooms:10,sourceFamilies:30,cohorts:120,participants:240,refusals:120,preparedRefusals:40,authorityRefusals:40,destructorRefusals:40,accessorInvocations:0,coldParticipants:240,fileComparisons:240,historyComparisons:240,uploadComparisons:240,futureDocumentCheckpoints:216,futureReviewCheckpoints:216,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/managed-source-bindings-probe',passed:true,...counts,scope:'Unsupported readonly-binding replacement refuses before accessor evaluation in genuine original and original/local-relay-retained mixed cohorts. All ten native profiles/transports, exact committed files/records, cold histories and future document/review Undo/Redo. Not a sandbox against arbitrary intrinsic/native-method replacement, browser durability or whole-room activation.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected canonical native runtime and inventory fixture manifest');console.log(JSON.stringify(await probeManagedSourceBindings(process.argv[2],process.argv[3]),null,2));}
