/** Exact immutable selection plus ordered clone creation. Ready describes local
 * staged bytes only; it never replaces a root or authorizes editing/activation. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import type {PhysicalAssetNativePin} from '../physical_room_operation_v3/asset_read_contract.js';
import type {RoomAssetAdoptionRecord,RoomAssetAdoptionTarget} from './contract.js';
import {fields,rows,hash,database,identifier,fail,MAX_ROOM_ASSET_BASE_BYTES,MAX_ROOM_ASSET_PLAN_BYTES} from './policy.js';
const families=['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'];
function native(value:unknown):PhysicalAssetNativePin{
 const r=fields(value,['document','review']),d=fields(r['document'],['kind','sha256']);if(d['kind']!=='original'&&d['kind']!=='segmented-v1')throw fail('asset_adoption_diverged');const document:PhysicalAssetNativePin['document']={kind:d['kind'],sha256:hash(d['sha256'])};
 const raw=r['review'];if(!raw||typeof raw!=='object')throw fail('asset_adoption_diverged');const kind=Object.getOwnPropertyDescriptor(raw,'kind')?.value;
 if(kind==='absent'){fields(raw,['kind']);return{document,review:{kind}};}if(kind==='unselected'){const q=fields(raw,['kind','nativeKind']);if(q['nativeKind']!=='original'&&q['nativeKind']!=='segmented-v1')throw fail('asset_adoption_diverged');return{document,review:{kind,nativeKind:q['nativeKind']}};}
 const q=fields(raw,['kind','sha256']);if(q['kind']!=='original'&&q['kind']!=='segmented-v1')throw fail('asset_adoption_diverged');return{document,review:{kind:q['kind'],sha256:hash(q['sha256'])}};
}
function file(value:unknown){const r=fields(value,['bytes','sha256']);if(!Number.isSafeInteger(r['bytes'])||(r['bytes'] as number)<1||(r['bytes'] as number)>MAX_ROOM_ASSET_BASE_BYTES)throw fail('asset_adoption_budget');return{bytes:r['bytes'] as number,sha256:hash(r['sha256'])};}
export function adoptionRecord(value:unknown,expected?:RoomAssetAdoptionRecord):RoomAssetAdoptionRecord{
 const r=fields(value,['format','formatVersion','database','source','phase','participants','unreconciledParticipants']);if(r['format']!=='breditor/physical-room-asset-adoption'||r['formatVersion']!==1||r['phase']!=='prepared'&&r['phase']!=='ready')throw fail('asset_adoption_diverged');
 const source=fields(r['source'],['operationDatabase','catalogDatabase','catalog','intentSha256']),name=database(r['database']),operationDatabase=database(source['operationDatabase']),catalogDatabase=database(source['catalogDatabase']);
 const used=new Set([name,operationDatabase,catalogDatabase]);if(used.size!==3)throw fail('asset_adoption_diverged');let previous='',tail=false,total=0;
 const participants=rows(r['participants'],value=>{const q=fields(value,['id','family','sourceDatabase','targetDatabase','sourceUploadsSha256','native','limits','base','selected','state']),id=identifier(q['id']);if(id<=previous||!families.includes(q['family'] as string)||!['reserved','started','complete'].includes(q['state'] as string)||tail&&q['state']!=='reserved')throw fail('asset_adoption_diverged');previous=id;if(q['state']!=='complete')tail=true;
  const sourceDatabase=database(q['sourceDatabase']),targetDatabase=database(q['targetDatabase']);if(used.has(sourceDatabase)||used.has(targetDatabase)||sourceDatabase===targetDatabase)throw fail('asset_adoption_diverged');used.add(sourceDatabase);used.add(targetDatabase);
  const rawLimits=fields(q['limits'],['maxFileBytes','maxStoredBytes','maxPixels','maxDimension']),limits=checkRichAssetLimits(rawLimits),base=file(q['base']),selected=file(q['selected']);total+=base.bytes;if(total>MAX_ROOM_ASSET_BASE_BYTES)throw fail('asset_adoption_budget');
  return{id,family:q['family'] as RoomAssetAdoptionTarget['family'],sourceDatabase,targetDatabase,sourceUploadsSha256:hash(q['sourceUploadsSha256']),native:native(q['native']),limits,base,selected,state:q['state'] as RoomAssetAdoptionTarget['state']};
 });
 if(!participants.length||r['phase']==='ready'&&participants.some(p=>p.state!=='complete'))throw fail('asset_adoption_diverged');const selected=new Set(participants.map(p=>p.id)),unreconciledParticipants=rows(r['unreconciledParticipants'],identifier);if(new Set(unreconciledParticipants).size!==unreconciledParticipants.length||unreconciledParticipants.some(id=>selected.has(id)))throw fail('asset_adoption_diverged');
 const result:RoomAssetAdoptionRecord={format:'breditor/physical-room-asset-adoption',formatVersion:1,database:name,source:{operationDatabase,catalogDatabase,catalog:physicalCatalogSelection(source['catalog']),intentSha256:hash(source['intentSha256'])},phase:r['phase'],participants,unreconciledParticipants};
 if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_ROOM_ASSET_PLAN_BYTES)throw fail('asset_adoption_budget');
 if(expected){const old=adoptionRecord(expected),stable=(v:RoomAssetAdoptionRecord)=>JSON.stringify({...v,phase:'prepared',participants:v.participants.map(p=>({...p,state:'reserved'}))});if(stable(result)!==stable(old))throw fail('asset_adoption_diverged');}return result;
}
export function adoptionTransition(before:RoomAssetAdoptionRecord,next:RoomAssetAdoptionRecord):void{
 const a=adoptionRecord(before),b=adoptionRecord(next,a);if(a.phase!=='prepared')throw fail('asset_adoption_diverged');if(b.phase==='ready'){if(JSON.stringify(a.participants)!==JSON.stringify(b.participants))throw fail('asset_adoption_diverged');return;}
 const at=a.participants.findIndex(p=>p.state!=='complete');if(at<0)throw fail('asset_adoption_diverged');for(const[i,p]of a.participants.entries()){const q=b.participants[i]!;if(i!==at?p.state!==q.state:p.state==='reserved'?q.state!=='started':p.state!=='started'||q.state!=='complete')throw fail('asset_adoption_diverged');}
}
