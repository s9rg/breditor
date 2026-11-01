/** Enumerate every literal original Pending point. This accepts only the
 * already Native-admitted history families; no recursive field search can omit
 * an unfamiliar state or turn a client reconciliation need into source proof. */
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import {generationAssetContent} from '../generation_recovery_control/asset_requirements.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {fail} from '../metadata_packet_retention/policy.js';
import type {OriginalSourceRequirement} from './contract.js';
function list(input:unknown):unknown[]{if(!Array.isArray(input)||input.length>1000000)throw fail('metadata_packet_retention_budget');return input;}
function packet(input:unknown):SharedPacketAssetIdentity{
 const row=fields(input,['kind','id'],['previousSuggestionId','suggestionId']),id=generationAssetContent(row['id']);
 if(row['kind']==='suggestion'){fields(input,['kind','id']);return{kind:'suggestion',id};}
 if(row['kind']!=='suggestion_revision')throw fail();fields(input,['kind','id','previousSuggestionId','suggestionId']);const previousSuggestionId=generationAssetContent(row['previousSuggestionId']),suggestionId=generationAssetContent(row['suggestionId']);if(previousSuggestionId===suggestionId)throw fail();return{kind:'suggestion_revision',id,previousSuggestionId,suggestionId};
}
function pending(input:unknown):SharedAssetCapturePending{
 const row=fields(input,['kind'],['id','packet','missing']);if(row['kind']==='uncached_version'){fields(input,['kind','id']);return{kind:'uncached_version',id:generationAssetContent(row['id'])};}
 if(row['kind']!=='source')throw fail();fields(input,['kind','packet','missing']);let before=0n;const missing=list(row['missing']).map(value=>{const r=fields(value,['writer','counter']),writer=r['writer'],counter=r['counter'];if(typeof writer!=='string'||typeof counter!=='string'||!/^[1-9][0-9]{0,19}$/.test(writer)||!/^[1-9][0-9]{0,9}$/.test(counter)||BigInt(writer)<=before||BigInt(writer)>18446744073709551614n||BigInt(counter)>2147483647n)throw fail();before=BigInt(writer);return{writer,counter};});if(!missing.length||missing.length>1024)throw fail();return{kind:'source',packet:packet(row['packet']),missing};
}
function object(input:unknown):Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input))throw fail();return input as Record<string,unknown>;}
export function originalSourceRequirements(base:LocalMetadataReferenceCut):readonly OriginalSourceRequirement[]{
 const result:OriginalSourceRequirement[]=[];let historyPending=false;
 const add=(participant:string,path:string,input:unknown)=>{for(const[index,value]of list(input).entries()){if(result.length>=1000000)throw fail('metadata_packet_retention_budget');result.push({kind:'original-pending',participant,path:path+'/pending/'+index,pending:pending(value)});}};
 for(const [memberIndex,member]of base.base.history.participants.entries()){
  if(!['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'].includes(member.family))throw fail();
  const history=object(member.history),start=result.length,path='base/participants/'+memberIndex+'/history';if(history['family']!==member.family||history['formatVersion']!==1)throw fail();
  if(member.family==='original'||member.family==='generation'){
   if(history['format']!=='breditor/operational-history-reference-read')throw fail();for(const[index,origin]of list(history['origins']).entries())add(member.id,path+'/origins/'+index,object(origin)['pending']);
   const current=object(history['current']);if(current['formatVersion']!==1||current['format']!==(member.family==='original'?'breditor/original-record-reference-capture':'breditor/generation-record-reference-capture'))throw fail();const before=result.length;for(const[index,state]of list(current['states']).entries())add(member.id,path+'/current/states/'+index,object(state)['pending']);if((current['kind']==='pending')!==(result.length>before)||!['ready','pending'].includes(current['kind'] as string))throw fail();
  }else{
   if(history['format']!=='breditor/fresh-operational-parent-history-read')throw fail();const source=object(history['source']),expected=member.family==='independent-local'?'breditor/local-operation-reference-capture':member.family==='independent-delivery'?'breditor/independent-operation-reference-capture':member.family==='restored-graph'?'breditor/restored-graph-reference-capture':'breditor/local-input-reference-capture';if(source['formatVersion']!==1||source['format']!==expected)throw fail();
   for(const[index,state]of list(source['states']).entries())add(member.id,path+'/source/states/'+index,object(state)['pending']);if((source['kind']==='pending')!==(result.length>start)||!['ready','pending'].includes(source['kind'] as string))throw fail();
  }
  if((history['kind']==='pending')!==(result.length>start)||!['ready','pending'].includes(history['kind'] as string))throw fail();historyPending||=result.length>start;
 }
 if((base.base.history.kind==='pending')!==historyPending)throw fail();const historyCount=result.length;
 for(const[index,point]of base.points.entries())for(const[laneIndex,lane]of point.lanes.entries())if(lane.outcome.kind==='pending')add(lane.lane,'metadata/points/'+index+'/lanes/'+laneIndex,lane.outcome.pending);
 const isPending=result.length>0||base.base.unreconciledParticipants.length>0;if((base.outcome.kind==='pending')!==isPending)throw fail();if(base.outcome.kind==='pending'){
  const metadata=base.outcome.pending.filter(row=>row.kind==='metadata');if((base.outcome.pending.some(row=>row.kind==='base-room'))!==(historyCount>0||base.base.unreconciledParticipants.length>0)||metadata.length!==base.points.flatMap(point=>point.lanes.filter(lane=>lane.outcome.kind==='pending')).length)throw fail();
 }
 return Object.freeze(result);
}
