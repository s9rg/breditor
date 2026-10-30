/** Compute the complete byte union without confusing local durable content
 * with server upload availability. Opaque mappings still need an exact
 * recorded provider resolution; content IDs retain their literal SHA identity. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import {assetReferenceKey,compareAssetText} from '../generation_recovery_control/asset_requirements.js';
import type {LocalMetadataRasterInfo} from './materialization_contract.js';
import {localMetadataAssetInfo} from './upload_inventory.js';
import {fail} from './error.js';
export function localMetadataRecoverableRequirements(references:readonly RichRetainedAssetReference[],local:ReadonlyMap<string,LocalMetadataRasterInfo>,provider:SharedServerLogGenerationRecoveryAssetRead){
 const assets=new Map(local),required=new Set(local.keys()),mapping=new Map(provider.resolutions.map(row=>[assetReferenceKey(row.reference),row.contentAsset])),unresolved:RichRetainedAssetReference[]=[];
 for(const info of provider.assets){const original=assets.get(info.asset);if(original&&localMetadataAssetInfo(original)!==localMetadataAssetInfo(info))throw fail('local_metadata_assets_state');assets.set(info.asset,info);required.add(info.asset);}
 for(const row of provider.resolutions)required.add(row.contentAsset);
 for(const reference of references){
  const recorded=mapping.get(assetReferenceKey(reference));
  if(/^sha256:[a-f0-9]{64}$/.test(reference.asset)){if(recorded&&recorded!==reference.asset)throw fail('local_metadata_assets_state');required.add(reference.asset);}
  else if(recorded)required.add(recorded);else unresolved.push(reference);
 }
 const unavailable=[...required].filter(asset=>!assets.has(asset)).sort(compareAssetText),payloads=[...required].filter(asset=>assets.has(asset)).sort(compareAssetText).map(asset=>assets.get(asset)!);
 return{payloads,unresolved,unavailable};
}
