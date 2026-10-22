/** Four selected source states may contribute four independently bounded reference sets.
 * The old single-source manifest limit is unchanged. Immutable asset identities stay global. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
import {checkAssetPayload} from '../asset_bytes/raster_manifest.js';
import {generationFields} from '../generation_source/identity.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export const MAX_OPERATION_RASTER_REFERENCES=400000;
const name=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v),content=(v:unknown):v is string=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
export function operationRasterManifest(inputBindings:unknown,inputAssets:unknown,total:unknown,limits:Readonly<AssetLimits>){
 if(!Number.isSafeInteger(total)||Number(total)<0||Number(total)>limits.maxStoredBytes||!Array.isArray(inputBindings)||inputBindings.length>MAX_OPERATION_RASTER_REFERENCES||!Array.isArray(inputAssets)||inputAssets.length>inputBindings.length)throw fail('independent_operation_raster_manifest');
 const bindings:SharedAssetByteBinding[]=[],assets:SharedAssetBytePayload[]=[],identities=new Map<string,string>(),used=new Set<string>();let previous:SharedAssetByteBinding|undefined,last='',bytes=0;
 for(const value of inputBindings){if(!generationFields(value,'asset,generation,identity,contentAsset')||!name(value['asset'])||!name(value['generation'])||!content(value['contentAsset']))throw fail();const addressed=content(value['asset']);if(value['identity']!==(addressed?'content-addressed':'host-verified')||addressed&&value['asset']!==value['contentAsset']||identities.has(value['asset'])&&identities.get(value['asset'])!==value['contentAsset'])throw fail();const pair={asset:value['asset'],generation:value['generation'],identity:value['identity'] as SharedAssetByteBinding['identity'],contentAsset:value['contentAsset']};if(previous&&(previous.asset>pair.asset||previous.asset===pair.asset&&previous.generation>=pair.generation))throw fail();previous=pair;bindings.push(pair);identities.set(pair.asset,pair.contentAsset);used.add(pair.contentAsset);}
 for(const value of inputAssets){const asset=checkAssetPayload(value,limits,false);if(asset.contentAsset<=last||!used.delete(asset.contentAsset))throw fail();last=asset.contentAsset;assets.push(asset);bytes+=asset.bytes;}
 if(used.size||bytes!==total)throw fail();return{bindings,assets,assetBytes:Number(total)};
}
