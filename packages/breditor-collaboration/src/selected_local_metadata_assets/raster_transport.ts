/** Actual branded byte readers only. Recovery can read an inactive host;
 * legacy account transports keep their original behavior and cache semantics. */
import {sharedRelayAssetReadPort,type SharedRelayAssets} from '../relay/assets.js';
import type {SharedRelayAssetBytes} from '../relay/asset_types.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import {localMetadataAvailabilityHost,type LocalMetadataAssetAvailabilityHost} from './availability_host.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {fail} from './error.js';
export type LocalMetadataRecoveryRasterTransport=SharedRelayAssets|LocalMetadataAssetAvailabilityHost;
export function localMetadataRecoveryRasterPort(transport:LocalMetadataRecoveryRasterTransport,expected:SharedServerLogGenerationRecoveryControlSelection):Readonly<{read:(asset:string,signal?:AbortSignal)=>Promise<SharedRelayAssetBytes|undefined>}>{
 let legacy:ReturnType<typeof sharedRelayAssetReadPort>|undefined;
 try{legacy=sharedRelayAssetReadPort(transport as SharedRelayAssets);}catch{/* Only the other actual private control brands may follow. */}
 if(legacy)return legacy;
 let selected:ReturnType<typeof localMetadataAvailabilityHost>;
 try{selected=localMetadataAvailabilityHost(transport as LocalMetadataAssetAvailabilityHost);}catch{throw fail('local_metadata_assets_state');}
 const current=selected.control.kind==='source'?selected.control.selection:selected.control.selection.current;
 if(!equal(current,expected))throw fail('local_metadata_assets_state');
 return Object.freeze({async read(asset:string,signal?:AbortSignal):Promise<SharedRelayAssetBytes|undefined>{const value=await selected.readRaster(asset,signal);if(!equal(value.selection,expected))throw fail('local_metadata_assets_state');if(value.raster===null)return undefined;const {info,blob}=value.raster;return Object.freeze({asset:info.asset,mime:info.mime,bytes:info.bytes,blob});}});
}
