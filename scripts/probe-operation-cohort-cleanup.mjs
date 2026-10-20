/** Reproducer for application-native destructors invalidating a later peer after
 * the old handoff's final managed-owner check. Runs unchanged on old/new archives. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {originalOperation} from './fixtures/operation-cohort/original-participant.mjs';
export async function probeOperationCohortCleanup(directory,manifestPath){
 const api=await import('../packages/breditor-collaboration/dist/index.js'),rich=await import('../packages/breditor-experimental-rich-content/index.js'),base=import.meta.resolve('@breditor/collaboration'),{prepareGenerationRoomParticipants}=await import(new URL('./generation_room_operation/custody.js',base).href),{prepareRoomParticipants}=await import(new URL('./room_operation/custody.js',base).href);
 const wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(directory,'breditor_shared_bg.wasm'))});const manifest=JSON.parse(readFileSync(manifestPath,'utf8')),restoreEnvironment=environment(),failures=[],counts={cases:0,retirementRefusals:0,retainedOrigins:0,coldHistories:0,networkCalls:0,restoredParticipants:0,restoredComponents:0};
 try{for(const atomic of [false,true]){const item=manifest.cases.map(row=>JSON.parse(readFileSync(row.path,'utf8'))).find(f=>f.language===1&&f.atomic===atomic);assert.ok(item);for(const family of ['original','generation']){
  const fixture=item,profile=wasm.SharedRichProfile.from_configuration_json(fixture.configuration),held=[];let armed=false,fired=false,cap,escaped;
  try{
   const method=family==='original'?'restore':'restore_segmented',restore=profile[method];profile[method]=function(...args){const raw=restore.apply(this,args),free=raw.free;raw.free=function(...args){free.apply(this,args);if(armed&&!fired){fired=true;(family==='original'?held[1].parts.session:held[1].session).core.retire();}};return raw;};
   for(const [index,client]of fixture.clients.entries()){const input={api,rich,profile,fixture,client,tag:`cleanup-${family}-${atomic}-${index}`,counts};if(family==='original')held.push(await originalOperation(input));else{const h=await generationParticipant({...input,kind:'local'});held.push(h);await h.holdOperation();}}
   const values=held.map((h,index)=>({id:'p'+index,operation:h.operation})),prepare=family==='original'?prepareRoomParticipants:prepareGenerationRoomParticipants,origins=held.map(h=>h.operation.origin());
   cap=await prepare(values,[],[],async()=>{},()=>{},()=>{});armed=true;
   let refusal;try{escaped=cap.commit();}catch(error){refusal=error;}finally{armed=false;}
   assert.equal(fired,true,'Exercise the actual temporary native reader destructor');
   // Check before cleanup: a returned later peer must not already be retired.
   assert.equal(escaped===undefined,true,'A peer retired by native-reader cleanup must not escape');assert.equal(refusal?.code,'retired');counts.retirementRefusals++;
   for(const [index,h]of held.entries()){assert.deepEqual(h.operation.origin(),origins[index]);if(family==='generation')assert.ok(h.operation.file().size>0);counts.retainedOrigins++;const expected=h.exportRecovery();await h.coldOperation();h.takeParts(await h.operation.intoParts());assert.deepEqual(h.exportRecovery(),expected);counts.coldHistories++;}
   counts.cases++;
  }catch(error){failures.push({atomic,family,fired,escaped:!!escaped,code:error.code??null,message:String(error)});}finally{armed=false;cap?.abandon();if(escaped)for(const [index,value]of escaped.participants.entries())held[index].takeParts(value.parts);for(const h of held.reverse())await h.close();profile.free();}
 }}}finally{restoreEnvironment();}
 if(failures.length){console.error('OPERATION_COHORT_CLEANUP_FAILURES '+JSON.stringify(failures));throw Error('Native cleanup cohort assertions failed');}
 assert.equal(counts.cases,4);assert.equal(counts.retirementRefusals,4);assert.equal(counts.coldHistories,8);assert.equal(counts.networkCalls,0);return{format:'breditor/operation-cohort-cleanup-probe',passed:true,...counts};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected native runtime and original fixture manifest');console.log(JSON.stringify(await probeOperationCohortCleanup(process.argv[2],process.argv[3]),null,2));}
