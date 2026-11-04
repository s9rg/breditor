/** Test-host choices over both complete immutable queue edges. The original
 * SDK preview/build guards remain authoritative; no queue is changed here. */
import assert from 'node:assert/strict';
import {previewRoomExecutionUnion,previewRoomExecutionAdoption} from '../../../packages/breditor-collaboration/dist/native_room_execution/preview.js';
const infoFields=['asset','mime','bytes','width','height','status','attempts','storageRef','failure'];
const info=state=>Object.fromEntries(infoFields.map(key=>[key,state[key]]));
/** Preserve the actual selected source's whole queue state, including genuine
 * receipts, pending work and explicit cancellations. Never infer ordering from
 * a local epoch/attempt counter, and never manufacture an uploaded state. */
export async function selectJointExecutionAssets(preparation,reads,owner,retain){
 const unionPreview=await previewRoomExecutionUnion(preparation,reads),observed=[];
 const choose=async(id,edge,conflict)=>{
  const actual=await owner.assets(id).get(conflict.asset);assert.ok(actual,'A conflict must name an actual selected source asset');
  const keep=edge==='union'?'current':'original',selected=conflict[keep];
  assert.deepEqual(info(selected),actual,'Chosen '+edge+' state must equal the actual source queue, including its original receipt');
  if(actual.status==='uploaded')assert.ok(actual.storageRef,'Uploaded requires the original real receipt');
  observed.push({id,edge,conflict,actual,keep});return{asset:conflict.asset,keep};
 };
 const union=[];
 for(const row of unionPreview){const choices=[];for(const conflict of row.preview.conflicts)choices.push(await choose(row.id,'union',conflict));union.push({id:row.id,union:choices});}
 const adoptionPreview=await previewRoomExecutionAdoption(preparation,union,reads),decisions=[];
 assert.deepEqual(adoptionPreview.map(row=>row.id),union.map(row=>row.id));
 for(const row of adoptionPreview){const choices=[];for(const conflict of row.preview.conflicts)choices.push(await choose(row.id,'adoption',conflict));decisions.push({...union.find(member=>member.id===row.id),adoption:choices});}
 retain('joint-execution-asset-decisions.json',{format:'breditor/test-joint-execution-asset-decisions',formatVersion:1,unionPreview,adoptionPreview,observed,decisions,policy:'preserve-exact-actual-selected-source-queue-state',uploadAcknowledgementsInvented:0});
 return decisions;
}
