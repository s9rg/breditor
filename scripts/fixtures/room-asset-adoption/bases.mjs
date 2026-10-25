/** Explicit local fixture decisions from actual root-owned whole upload cuts. */
import {createHash} from 'node:crypto';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {PhysicalRoomAssetAdoption} from '../../../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
export const fileHash=async file=>createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
export async function roomAssetChoices(root,tag,{keep='original'}={}){
 const captured=await PhysicalRoomAssetAdoption.capture(root,{checkAuthority(){}}),participants=[];let branch,incoming,custody,attempt;
 try{for(const row of captured.participants){branch=await RichAssetStore.restoreBackup(tag+'-branch-'+row.id,row.uploads,{uploadState:'preserve',limits:row.limits});incoming=await RichAssetStore.open(tag+'-incoming-'+row.id);await incoming.ingest(new Blob([pixel],{type:'image/png'}));await incoming.ingest(new Blob([secondPixel],{type:'image/png'}));await incoming.flush(async()=> 'adopted-local/'+row.id);const file=await incoming.exportBackup();incoming.close();incoming=undefined;custody=await branch.acquireRecoveryCustody();attempt=await branch.beginHeldReconciliation(custody,file,{database:tag+'-decision-'+row.id,checkSource(){}});await attempt.commit(attempt.preview().conflicts.map(row=>({asset:row.asset,keep})));const base=await attempt.exportRetainedBase();participants.push({id:row.id,targetDatabase:tag+'-target-'+row.id,base:{file:base,sha256:await fileHash(base)}});await attempt.close();attempt=undefined;await custody.close();custody=undefined;branch.close();branch=undefined;}
  return{captured,participants};
 }finally{await attempt?.close();await custody?.close();branch?.close();incoming?.close();}
}
