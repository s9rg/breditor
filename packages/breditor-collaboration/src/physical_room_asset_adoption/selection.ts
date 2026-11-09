/** Admit every complete selected base against actual privately held source
 * cuts, before any destination opens. No metadata-shaped owner is accepted. */
import {RichAssetReconciledBase,checkRichAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import type {PhysicalAssetReadScope,PhysicalAssetReadParticipant,PhysicalAssetSelectionScope} from '../physical_room_operation_v3/asset_read_contract.js';
import type {RoomAssetAdoptionChoice,RoomAssetAdoptionRecord} from './contract.js';
import type {AdoptionFiles} from './storage.js';
import {adoptionRecord} from './record.js';
import {fields,rows,hash,database,identifier,fail,MAX_ROOM_ASSET_BASE_BYTES} from './policy.js';
const read=RichAssetReconciledBase.read,metadata=RichAssetReconciledBase.prototype.metadata,file=RichAssetReconciledBase.prototype.file,dispose=RichAssetReconciledBase.prototype.dispose,predecessor=RichAssetReconciledBase.prototype.verifyPredecessor;
export function adoptionChoices(input:unknown):readonly RoomAssetAdoptionChoice[]{
 const chosen=rows(input,value=>{const row=fields(value,['id','targetDatabase','base']),base=fields(row['base'],['file','sha256']);if(!(base['file'] instanceof Blob))throw fail('asset_adoption_policy');return{id:identifier(row['id']),targetDatabase:database(row['targetDatabase']),base:{file:new Blob([base['file']]),sha256:hash(base['sha256'])}};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 if(!chosen.length||new Set(chosen.map(p=>p.id)).size!==chosen.length)throw fail('asset_adoption_policy');return chosen;
}
const limits=(source:Readonly<AssetLimits>,base:Readonly<AssetLimits>)=>checkRichAssetLimits(Object.fromEntries(Object.entries(source).map(([key,value])=>[key,Math.min(value,base[key as keyof AssetLimits])])));
/** Admit the semantics of an already byte-selected reconciled base. */
async function admitBase(source:PhysicalAssetReadParticipant,input:Blob,scope:PhysicalAssetReadScope){
 scope.check();
 const base=await read.call(RichAssetReconciledBase,input,{limits:source.limits});
 try{
  scope.check();
  const m=metadata.call(base);
  if(m.files.current.sha256!==source.uploadsSha256)throw fail('asset_adoption_diverged');
  await predecessor.call(base,source.uploads,{limits:source.limits});scope.check();
  return {limits:limits(source.limits,m.limits),selected:{bytes:m.files.selected.bytes,sha256:m.files.selected.sha256}};
 }finally{dispose.call(base);}
}
export async function prepareAdoptionSelection(name:string,choices:readonly RoomAssetAdoptionChoice[],scope:PhysicalAssetSelectionScope):Promise<{record:RoomAssetAdoptionRecord;files:AdoptionFiles}>{
 if(scope.namespaces.includes(name)||choices.length!==scope.participants.length||choices.some((row,i)=>row.id!==scope.participants[i]?.id))throw fail('asset_adoption_policy');const used=new Set([name,...scope.namespaces]),targets=[];let bytes=0;const files=new Map<string,ArrayBuffer>();
 // Whole choice/name admission before the first raster or authority callback.
 for(const row of choices){if(used.has(row.targetDatabase))throw fail('asset_adoption_policy');used.add(row.targetDatabase);bytes+=row.base.file.size;if(bytes>MAX_ROOM_ASSET_BASE_BYTES)throw fail('asset_adoption_budget');}
 for(const[i,row]of choices.entries()){
  const source=scope.participants[i]!;
  const {bytes:owned,sha256}=await scope.readAndDigest(row.base.file,MAX_ROOM_ASSET_BASE_BYTES);
  if(sha256!==row.base.sha256)throw fail('asset_adoption_diverged');
  const selected=await admitBase(source,new Blob([owned]),scope);
  files.set(row.id,owned.buffer);
  targets.push({id:source.id,family:source.family,sourceDatabase:source.sourceDatabase,targetDatabase:row.targetDatabase,sourceUploadsSha256:source.uploadsSha256,native:source.native,limits:selected.limits,base:{bytes:owned.byteLength,sha256},selected:selected.selected,state:'reserved' as const});
 }
 const record=adoptionRecord({format:'breditor/physical-room-asset-adoption',formatVersion:1,database:name,source:scope.source,phase:'prepared',participants:targets,unreconciledParticipants:scope.unreconciledParticipants});scope.check();return{record,files};
}
export async function verifyAdoptionSelection(record:RoomAssetAdoptionRecord,files:AdoptionFiles,scope:PhysicalAssetReadScope):Promise<void>{
 if(JSON.stringify(record.source)!==JSON.stringify(scope.source)||JSON.stringify(record.unreconciledParticipants)!==JSON.stringify(scope.unreconciledParticipants)||record.participants.length!==scope.participants.length||files.size!==record.participants.length)throw fail('asset_adoption_diverged');const used=new Set([record.database,...scope.namespaces]);if(scope.namespaces.includes(record.database))throw fail('asset_adoption_policy');
 for(const[i,row]of record.participants.entries()){const source=scope.participants[i],bytes=files.get(row.id);if(!source||source.id!==row.id||source.family!==row.family||source.sourceDatabase!==row.sourceDatabase||source.uploadsSha256!==row.sourceUploadsSha256||JSON.stringify(source.native)!==JSON.stringify(row.native)||!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes||bytes.byteLength>MAX_ROOM_ASSET_BASE_BYTES||used.has(row.targetDatabase))throw fail('asset_adoption_diverged');used.add(row.targetDatabase);
  const input=new Blob([bytes]);
  scope.check();
  if(await scope.digest(input)!==row.base.sha256)throw fail('asset_adoption_diverged');
  const selected=await admitBase(source,input,scope);
  if(JSON.stringify(selected.limits)!==JSON.stringify(row.limits)||JSON.stringify(selected.selected)!==JSON.stringify(row.selected))throw fail('asset_adoption_diverged');
 }scope.check();
}
export async function selectedAdoptionFile(row:RoomAssetAdoptionRecord['participants'][number],bytes:ArrayBuffer,check:()=>void):Promise<Blob>{
 check();const base=await read.call(RichAssetReconciledBase,new Blob([bytes]),{limits:row.limits});try{check();return file.call(base,'selected');}finally{dispose.call(base);}
}
