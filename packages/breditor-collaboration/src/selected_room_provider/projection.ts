/** One private selected/origin upload borrow shared by separately admitted
 * physical and generation controls. No runtime incoming port is accepted. */
import {RichAssetArchive} from '@breditor/experimental-rich-content';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import type {SelectedRoomUploadPin} from './contract.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
const info=(row:SelectedProviderAssetInfo)=>JSON.stringify([row.asset,row.mime,row.bytes,row.width,row.height]);
/** Private held-byte projection. Family-specific genuine host admission must
 * precede this function. Reports and supplied callbacks never construct ports. */
export interface SelectedProviderAssetInfo {readonly asset:string;readonly mime:'image/png'|'image/jpeg'|'image/webp';readonly bytes:number;readonly width:number;readonly height:number}
export interface SelectedProviderRead {readonly assets:readonly SelectedProviderAssetInfo[];readonly missing:readonly unknown[]}
export interface SelectedProviderPort<R extends SelectedProviderRead> {check(signal?:AbortSignal):Promise<void>;checkAssets(input:Readonly<{references:readonly Readonly<{asset:string;generation:string}>[];uploads:readonly string[]}>,signal?:AbortSignal):Promise<R>}
export function projectSelectedRoomProvider<R extends SelectedProviderRead,T>(port:SelectedProviderPort<R>,record:RoomAssetAdoptionRecord,project:(cut:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,pins:readonly SelectedRoomUploadPin[],provider:R|null)=>T){
 return async(cut:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,check:()=>void):Promise<T>=>{
  const content=new Map<string,SelectedProviderAssetInfo>(),pins:SelectedRoomUploadPin[]=[],sources=[...scope.uploads.map(row=>({...row,role:'origin' as const})),...cut.uploads.map(row=>({...row,role:'selected' as const}))];
  if(sources.length>2048||sources.reduce((n,row)=>n+row.file.size,0)>512*1024*1024)throw fail('asset_adoption_budget');
  for(const row of sources){check();const selected=record.participants.find(value=>value.id===row.id);if(!selected)throw fail('asset_adoption_diverged');const archive=await read.call(RichAssetArchive,row.file,{limits:selected.limits,...(scope.signal?{signal:scope.signal}:{})});
   try{check();const values=entries.call(archive);for(const value of values){const next:SelectedProviderAssetInfo={asset:value.asset,mime:value.mime,bytes:value.bytes,width:value.width,height:value.height},previous=content.get(next.asset);if(previous&&info(previous)!==info(next))throw fail('asset_adoption_diverged');content.set(next.asset,next);}pins.push({id:row.id,role:row.role,bytes:row.file.size,sha256:await scope.assets.digest(row.file),entries:values});check();}finally{dispose.call(archive);}
  }
  let provider:R|null=null;if(scope.history.history.kind!=='ready'||scope.history.unreconciledParticipants.length){await port.check(scope.signal);check();}else{provider=await port.checkAssets({references:scope.history.history.references,uploads:[...content.keys()].sort()},scope.signal);check();for(const actual of provider.assets){const local=content.get(actual.asset);if(local&&info(local)!==info(actual))throw fail('asset_adoption_diverged');}}
  return project(cut,scope,pins,provider);
 };
}
