/** Twenty fixed native room cases, not a Cartesian policy/family-selection
 * qualification. Source and installed consumers execute the same assertions. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {physicalCatalogV3Fixture} from './fixtures/physical-catalog-v3/fixture.mjs';

export async function probePhysicalCatalogV3({api,rich,internals,runtime,manifestPath}){
 const native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');assert.equal(manifest.cases.length,10);
 const fixtures={native,manifest,fixture:item=>JSON.parse(readFileSync(item.path,'utf8')),inventory:item=>new Blob([readFileSync(resolve(item.path,'../inventory.json'))]),profile(fixture){const method=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`;return native.SharedRichProfile[method](fixture.configuration);}},profiles=manifest.cases.filter((_,index)=>index%2===1),expected=[[1,false],[2,false],[2,true],[3,false],[3,true]];
 assert.deepEqual(profiles.map(item=>{const row=fixtures.fixture(item);assert.equal(row.atomic,true);return[row.language,row.standard];}),expected);
 const buffer=async file=>Buffer.from(await file.arrayBuffer()),counts={cases:0,profiles:0,exactColdFiles:0,coldCatalogs:0,rehashedCatalogs:0,freshIncomingBorrows:0,retainedUnreconciledCopies:0,localCommentsUnbound:0,unchangedNativeRecoveries:0,unchangedViews:0,unchangedWholeUploads:0,networkCalls:0};
 const fetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const url=String(args[0]);if(!url.startsWith('blob:')&&!url.startsWith('data:')){counts.networkCalls++;throw Error('The native catalog probe must remain disconnected');}return fetch(...args);};
 try{
  for(const[profileIndex,item]of profiles.entries()){
   for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true]){
    let h;try{
     h=await physicalCatalogV3Fixture({api,rich,internals,fixtures,item,documentSegmented,reviewSegmented,tag:'room-profile-'+profileIndex+'-'+Number(documentSegmented)+Number(reviewSegmented)});
     const recovery=h.before.native,view=h.before.view,uploads=await buffer(h.before.uploads);
     await h.begin();await h.store.verify();counts.rehashedCatalogs++;const selected=await h.sources();counts.freshIncomingBorrows++;let result=h.store.checkSources(selected);assert.equal(result.kind,'pending');assert.equal(result.coverage.checkedParticipants.length,2);assert.equal(result.coverage.missing.filter(row=>row.kind==='unbound_review').length,1);counts.localCommentsUnbound++;assert.equal(result.unreconciledParticipants.length,7);counts.retainedUnreconciledCopies+=result.unreconciledParticipants.length;
     h.release();await h.closeStore();await h.resume();await h.store.verify();counts.coldCatalogs++;counts.rehashedCatalogs++;
     for(const[key,file]of h.store.files()){assert.deepEqual(await buffer(file),await buffer(h.files.get(key)),key);counts.exactColdFiles++;}
     result=h.store.checkSources(await h.sources());counts.freshIncomingBorrows++;assert.equal(result.kind,'pending');assert.equal(result.unreconciledParticipants.length,7);h.release();
     assert.deepEqual(h.local.source.exportRecovery(),recovery);counts.unchangedNativeRecoveries++;assert.deepEqual(h.local.source.core.view(),view);counts.unchangedViews++;assert.deepEqual(await buffer(await h.local.uploads.exportBackup()),uploads);counts.unchangedWholeUploads++;assert.equal(h.h.counts.networkCalls,0);counts.cases++;
    }catch(error){throw new Error('Seven-family room profile='+profileIndex+' document='+documentSegmented+' review='+reviewSegmented+' case='+counts.cases,{cause:error});}finally{await h?.close();}
   }counts.profiles++;
  }
 }finally{globalThis.fetch=fetch;}
 for(const[key,value]of Object.entries({cases:20,profiles:5,exactColdFiles:240,coldCatalogs:20,rehashedCatalogs:40,freshIncomingBorrows:40,retainedUnreconciledCopies:140,localCommentsUnbound:20,unchangedNativeRecoveries:20,unchangedViews:20,unchangedWholeUploads:20,networkCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/physical-catalog-v3-probe',formatVersion:1,passed:true,...counts,families:7,historyPairs:4,transport:'atomic-v2',fullCartesianPolicyDomain:false,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Five actual normal native profiles, four document/comment history pairs, atomic-v2 inventories and all seven retained file families. Real native incoming borrows, exact cold files, native/version/view/whole-upload conservation and unresolved historical copies/local comments. Synthetic storage is not physical durability, actual writer/upload adoption, complete retained-store/provider/client reconciliation, authenticated activation, sustainable history or V1 approval.'};
}
