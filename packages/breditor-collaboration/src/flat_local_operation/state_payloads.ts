/** Role-specific byte/count preflight before any native factory is invoked.
 * Framing proves raw integrity; these decoded records remain DATA, not a native
 * owner or custody ticket. Actual chronology/pixels/uploads are admitted later. */
import {MAX_ASSET_BACKUP_BYTES,type AssetLimits} from '@breditor/experimental-rich-content';
import {generationFields} from '../generation_source/identity.js';
import {independentRecordLimit} from '../independent_source/records.js';
import {MAX_INDEPENDENT_SOURCE_BYTES,MAX_INDEPENDENT_SOURCE_RECORDS} from '../independent_source/contract.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES,type IndependentHistoryIdentity} from '../independent_history/contract.js';
import {operationRasterManifest,MAX_OPERATION_RASTER_REFERENCES} from '../independent_operation/portable_rasters.js';
import {FlatLocalProvenance,flatLocalFraming} from './framing.js';
import {MAX_FLAT_LOCAL_STATE_BYTES} from './limits.js';import {flatLocalFailure as fail} from './failure.js';
function record(value:unknown,keys:string):Record<string,unknown>{if(!generationFields(value,keys))throw fail('flat_local_state_payloads');return value;}
function blob(graph:FlatLocalProvenance,value:unknown):Blob{const r=record(value,'bytes,sha256');if(typeof r['bytes']!=='number'||!Number.isSafeInteger(r['bytes'])||r['bytes']<1||typeof r['sha256']!=='string'||!/^[a-f0-9]{64}$/.test(r['sha256']))throw fail('flat_local_state_payloads');const part=flatLocalFraming.payload.call(graph,r['sha256'],r['bytes']);if(!part)throw fail('flat_local_state_payloads');return part;}
export async function readFlatLocalStatePayloads(graph:FlatLocalProvenance,identity:IndependentHistoryIdentity,limits:Readonly<AssetLimits>,guard:()=>void):Promise<readonly Record<string,unknown>[]>{
 const metadata=flatLocalFraming.metadata.call(graph),count=metadata.states.length,states:Record<string,unknown>[]=[],indices=new Map(metadata.payloads.map((p,index)=>[JSON.stringify([p.bytes,p.sha256]),index]));
 for(let index=0;index<count;index++){
  guard();const part=flatLocalFraming.statePart.call(graph,index);if(part.size>MAX_FLAT_LOCAL_STATE_BYTES)throw fail('flat_local_state_budget');const text=await part.text();guard();const s=record(JSON.parse(text),'format,formatVersion,operation,selection,intent,observed,current,pending,live,uploads,bindings,assets,assetBytes');if(s['format']!=='breditor/shared-flat-local-state'||s['formatVersion']!==1)throw fail('flat_local_state_payloads');
  const declared:number[]=[],take=(value:unknown):Blob=>{const part=blob(graph,value),reference=record(value,'bytes,sha256'),at=indices.get(JSON.stringify([reference['bytes'],reference['sha256']]));if(at===undefined)throw fail('flat_local_state_payloads');declared.push(at);return part;};
  for(const raw of[s['current'],s['pending']]){
   if(raw===null)continue;const cut=record(raw,'head,files');if(!Array.isArray(cut['files'])||cut['files'].length>126)throw fail('flat_local_state_budget');const head=take(cut['head']);if(head.size>MAX_INDEPENDENT_HISTORY_HEAD_BYTES+2048)throw fail('flat_local_state_budget');let bytes=head.size;
   // Native review references deliberately include their existing domain/prefix.
   // These are not the outer raw-payload SHA values used by graph framing.
   for(const value of cut['files']){const f=record(value,'lane,generation,kind,sha256,payload');if(f['lane']!=='document'&&f['lane']!=='review'||f['kind']!=='root'&&f['kind']!=='sealed'||typeof f['generation']!=='string'||!f['generation']||f['generation'].length>1024||typeof f['sha256']!=='string'||!(f['lane']==='review'?/^sha256:[a-f0-9]{64}$/:/^[a-f0-9]{64}$/).test(f['sha256']))throw fail('flat_local_state_payloads');const file=take(f['payload']);if(file.size>16*1024*1024||(bytes+=file.size)>MAX_INDEPENDENT_SOURCE_BYTES+2048)throw fail('flat_local_state_budget');}
  }
  if(!Array.isArray(s['live'])||s['live'].length<2||s['live'].length>MAX_INDEPENDENT_SOURCE_RECORDS)throw fail('flat_local_state_budget');let sourceBytes=0;
  for(const[at,value]of s['live'].entries()){const r=record(value,'kind,index,payload'),kind=at===0?'document':at===1?'review':'version';if(r['kind']!==kind||r['index']!==(at<2?0:at-2))throw fail('flat_local_state_payloads');const row=take(r['payload']);if(row.size>independentRecordLimit(kind,identity)||(sourceBytes+=row.size)>MAX_INDEPENDENT_SOURCE_BYTES)throw fail('flat_local_state_budget');}
  if(take(s['uploads']).size>MAX_ASSET_BACKUP_BYTES||!Array.isArray(s['assets'])||s['assets'].length>MAX_OPERATION_RASTER_REFERENCES)throw fail('flat_local_state_budget');
  const rows=s['assets'].map(value=>record(value,'contentAsset,mime,width,height,bytes,payload')),manifest=operationRasterManifest(s['bindings'],rows.map(({payload,...asset})=>{void payload;return asset;}),s['assetBytes'],limits);
  for(const[at,asset]of manifest.assets.entries()){const bytes=take(rows[at]!['payload']);if(bytes.size!==asset.bytes||bytes.size>limits.maxFileBytes)throw fail('flat_local_state_budget');}
  // Exact semantic use belongs to preflight too: integrity alone must not let
  // an opaque/unused body reach any native constructor. Preserve writer order.
  if(JSON.stringify(declared)!==JSON.stringify(metadata.states[index]?.additions))throw fail('flat_local_state_payloads');
  guard();states.push(s);
 }
 guard();return states;
}
