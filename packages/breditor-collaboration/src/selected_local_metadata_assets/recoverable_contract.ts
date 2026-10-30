/** A complete local/provider byte union is recoverable even when some uploads
 * remain absent from the server. This never turns that absence into an ACK. */
import type {LocalMetadataReferenceBundle,LocalMetadataReferenceCut} from './room_contract.js';
import type {LocalMetadataRasterInfo,LocalMetadataMaterializationOutcome} from './materialization_contract.js';
import type {LocalMetadataAssetAvailabilityRead} from './availability_contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
export interface LocalMetadataRecoverableRasterHeader {
 readonly format:'breditor/local-metadata-materialized-rasters';readonly formatVersion:2;
 readonly scope:'complete-client-cut-and-local-provider-raster-union';
 readonly references:Readonly<{bytes:number;sha256:string}>;
 readonly availability:unknown;
 readonly payloads:readonly Readonly<LocalMetadataRasterInfo&{offset:number}>[];
}
export interface LocalMetadataRecoverableBundle {
 readonly format:'breditor/selected-local-metadata-recoverable-bundle';readonly formatVersion:1;
 readonly references:LocalMetadataReferenceBundle;
 readonly rasters:Readonly<{file:Blob;bytes:number;sha256:string}>;
}
export type LocalMetadataRecoverableOutcome=Readonly<{kind:'ready';bundle:LocalMetadataRecoverableBundle}>|Extract<LocalMetadataMaterializationOutcome,{kind:'pending'}>;
export interface LocalMetadataRecoverableInspection {
 readonly format:'breditor/selected-local-metadata-recoverable-inspection';readonly formatVersion:1;
 readonly scope:'native-client-cut-and-local-provider-raster-union';
 readonly references:LocalMetadataReferenceCut;
 readonly rasters:Readonly<{bytes:number;sha256:string;payloads:readonly LocalMetadataRasterInfo[]}>;
 /** The provider may still report missing bytes. This is recorded DATA, not
  * uploaded state, acknowledged queues, serving authority or a current grant. */
 readonly recordedAvailability:LocalMetadataAssetAvailabilityRead&Readonly<{provider:SharedServerLogGenerationRecoveryAssetRead}>;
}
