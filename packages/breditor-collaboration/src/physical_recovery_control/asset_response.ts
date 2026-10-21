/** Complete closed result and requirement partition; no absent entry can silently become Ready. */
import {archiveFields as object,archiveInteger as integer} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {physicalControlSelection} from './identity.js';
import {controlFailure as fail} from './policy.js';
import {assetReferenceKey,physicalAssetReference,physicalAssetContent,compareAssetReference,compareAssetText} from './asset_requirements.js';
import {MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS as maximum,type SharedPhysicalRecoveryAssetRequirements,type SharedPhysicalRecoveryAssetInfo,type SharedPhysicalRecoveryAssetMissing,type SharedPhysicalRecoveryAssetResolution,type SharedPhysicalRecoveryAssetRead} from './asset_contract.js';
import type {SharedPhysicalRecoveryControlSelection} from './contract.js';
function array(value:unknown):unknown[]{if(!Array.isArray(value)||value.length>maximum)throw fail();return value;}
function info(value:unknown):SharedPhysicalRecoveryAssetInfo{
 const r=object(value,'asset,mime,bytes,width,height'),mime=r['mime'];if(mime!=='image/png'&&mime!=='image/jpeg'&&mime!=='image/webp')throw fail();
 const width=integer(r['width'],1,16384),height=integer(r['height'],1,16384);if(width*height>32000000)throw fail();return{asset:physicalAssetContent(r['asset']),mime,bytes:integer(r['bytes'],1,10*1024*1024),width,height};
}
function missing(value:unknown):SharedPhysicalRecoveryAssetMissing{
 if(!value||typeof value!=='object')throw fail();const kind=(value as Record<string,unknown>)['kind'];
 if(kind==='mapping'){const r=object(value,'kind,reference');return{kind,reference:physicalAssetReference(r['reference'])};}
 if(kind==='bytes'){const r=object(value,'kind,reference,contentAsset');return{kind,reference:physicalAssetReference(r['reference']),contentAsset:physicalAssetContent(r['contentAsset'])};}
 if(kind==='uploadBytes'){const r=object(value,'kind,contentAsset');return{kind,contentAsset:physicalAssetContent(r['contentAsset'])};}throw fail();
}
function complete(resolutions:readonly SharedPhysicalRecoveryAssetResolution[],assets:readonly SharedPhysicalRecoveryAssetInfo[],missing:readonly SharedPhysicalRecoveryAssetMissing[],request:SharedPhysicalRecoveryAssetRequirements):void{
 const bound=new Map(resolutions.map(r=>[assetReferenceKey(r.reference),r.contentAsset])),payloads=new Set(assets.map(r=>r.asset)),requested=new Set(request.references.map(assetReferenceKey)),uploads=new Set(request.uploads),missingMappings=new Set<string>(),missingBytes=new Map<string,string>(),missingUploads=new Set<string>(),used=new Set<string>(),identities=new Map<string,string>();
 for(const item of missing){if(item.kind==='uploadBytes'){if(!uploads.has(item.contentAsset)||payloads.has(item.contentAsset)||missingUploads.has(item.contentAsset))throw fail();missingUploads.add(item.contentAsset);}else{
  const key=assetReferenceKey(item.reference);if(!requested.has(key)||missingMappings.has(key)||missingBytes.has(key))throw fail();
  if(item.kind==='mapping'){if(bound.has(key))throw fail();missingMappings.add(key);}else{if(bound.get(key)!==item.contentAsset||payloads.has(item.contentAsset))throw fail();missingBytes.set(key,item.contentAsset);}
 }}
 for(const r of resolutions){const key=assetReferenceKey(r.reference);if(payloads.has(r.contentAsset)===missingBytes.has(key))throw fail();if(/^sha256:[a-f0-9]{64}$/.test(r.reference.asset)&&r.reference.asset!==r.contentAsset||identities.has(r.reference.asset)&&identities.get(r.reference.asset)!==r.contentAsset)throw fail();identities.set(r.reference.asset,r.contentAsset);used.add(r.contentAsset);}
 for(const key of requested)if(!bound.has(key)&&!missingMappings.has(key))throw fail();
 for(const key of uploads){if(payloads.has(key)===missingUploads.has(key))throw fail();used.add(key);}
 for(const key of payloads)if(!used.has(key))throw fail();
}
export function readPhysicalAssetReceipt(text:string,expected:SharedPhysicalRecoveryControlSelection,sha256:string,request:SharedPhysicalRecoveryAssetRequirements):SharedPhysicalRecoveryAssetRead{
 try{
  const r=object(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,resolutions,assets,missing');if(r['format']!=='breditor/physical-room-recovery-asset-read'||r['formatVersion']!==1||r['scope']!=='server-and-declared-client-binding-and-upload-bytes'||r['requestSha256']!==sha256)throw fail();
  const selection=physicalControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();
  const resolutions=array(r['resolutions']).map(value=>{const row=object(value,'reference,contentAsset');return{reference:physicalAssetReference(row['reference']),contentAsset:physicalAssetContent(row['contentAsset'])};}),assets=array(r['assets']).map(info),absent=array(r['missing']).map(missing);
  for(let i=1;i<resolutions.length;i++)if(compareAssetReference(resolutions[i-1]!.reference,resolutions[i]!.reference)>=0)throw fail();
  for(let i=1;i<assets.length;i++)if(compareAssetText(assets[i-1]!.asset,assets[i]!.asset)>=0)throw fail();
  if(assets.length>selection.source.server.assets.assets||assets.reduce((sum,row)=>sum+row.bytes,0)>selection.source.server.assets.bytes)throw fail();complete(resolutions,assets,absent,request);
  const read:SharedPhysicalRecoveryAssetRead={format:'breditor/physical-room-recovery-asset-read',formatVersion:1,selection,requestSha256:sha256,scope:'server-and-declared-client-binding-and-upload-bytes',resolutions,assets,missing:absent};if(JSON.stringify(read)!==text)throw fail();return frozen(read);
 }catch{throw fail('control_protocol');}
}
