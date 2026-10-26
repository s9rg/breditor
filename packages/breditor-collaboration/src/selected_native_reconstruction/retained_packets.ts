/** Pure continuation of the shared retained packet families, not a new stored
 * protocol. Document journal formats and current grants remain with each caller.
 * Additional admitted rows may not erase/change an earlier complete row.
 */
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {fail} from './policy.js';
interface Input{readonly source:Readonly<{versions:readonly string[]}>;readonly retainedBinding:SharedSegmentedRetainedBinding;readonly retained:SegmentedRetainedRecords}
export function verifyRetainedReconstructionPackets(before:Input,after:Input):void{
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),refuse=()=>{throw fail('native_reconstruction_requires_merge');};
 if(!same(before.retainedBinding,after.retainedBinding))refuse();
 for(const kind of ['suggestions','revisions'] as const){
  const old=before.retained[kind],next=after.retained[kind];
  if(old===null?next!==null:next===null)refuse();
  if(old!==null&&next!==null){
   const {retained:oldRows,...oldIdentity}=old,{retained:newRows,...newIdentity}=next;
   const available=new Set(newRows.map(row=>JSON.stringify(row)));
   if(!same(oldIdentity,newIdentity)||oldRows.some(row=>!available.has(JSON.stringify(row))))refuse();
  }
 }
 const old=before.retained.versions,next=after.retained.versions;
 if(old===null?next!==null:next===null)refuse();
 if(old!==null&&next!==null){
  const {packets:oldPackets,catalog:oldCatalog,...oldIdentity}=old,{packets:newPackets,catalog:newCatalog,...newIdentity}=next;
  const available=new Set(newPackets.map(row=>JSON.stringify(row)));
  if(!same(oldIdentity,newIdentity)||oldCatalog!==null&&!same(oldCatalog,newCatalog)||oldPackets.some(row=>!available.has(JSON.stringify(row))))refuse();
 }
 if(before.source.versions.length>after.source.versions.length||before.source.versions.some((packet,index)=>after.source.versions[index]!==packet))refuse();
}
