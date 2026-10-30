/** Immutable recovery bytes. Historical mapping data never restores a live
 * provider, editor writer, upload acknowledgement or serving capability. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {LocalMetadataReferenceBundle} from './room_contract.js';
import type {LocalMetadataReferenceCut} from './room_contract.js';
import type {LocalMetadataAssetAvailabilityBundle} from './availability_contract.js';
import type {LocalMetadataAssetAvailabilityRead} from './availability_contract.js';
export interface LocalMetadataRasterInfo {
 readonly asset:string;readonly mime:'image/png'|'image/jpeg'|'image/webp';
 readonly bytes:number;readonly width:number;readonly height:number;
}
export interface LocalMetadataRasterHeader {
 readonly format:'breditor/local-metadata-materialized-rasters';readonly formatVersion:1;
 readonly scope:'client-metadata-cut-and-recorded-provider-rasters';
 readonly references:Readonly<{bytes:number;sha256:string}>;
 /** Recorded DATA. A raw raster reader does not authenticate this controller
  * or claim that its mappings remain current. Native owner inspection must
  * separately verify the literal reference bundle and complete requirements. */
 readonly availability:unknown;
 readonly payloads:readonly Readonly<LocalMetadataRasterInfo&{offset:number}>[];
}
export interface LocalMetadataMaterializedBundle {
 readonly format:'breditor/selected-local-metadata-materialized-bundle';readonly formatVersion:1;
 readonly references:LocalMetadataReferenceBundle;
 readonly rasters:Readonly<{file:Blob;bytes:number;sha256:string}>;
}
export type LocalMetadataMaterializationOutcome=
 |Readonly<{kind:'ready';bundle:LocalMetadataMaterializedBundle}>
 |Readonly<{kind:'pending';availability:LocalMetadataAssetAvailabilityBundle;missing:readonly Readonly<{kind:'source-or-provider'}|{kind:'download';asset:string}>[]}>;
export interface LocalMetadataMaterializationOptions {readonly limits?:Partial<AssetLimits>}
/** Native-admitted dependency data and complete admitted raster bytes. The
 * recorded provider observation is historical, unsigned DATA: before using an
 * opaque mapping or serving a recovered room, authenticate a fresh controller
 * and reconcile the complete union again. This is not an activation grant. */
export interface LocalMetadataMaterializedInspection {
 readonly format:'breditor/selected-local-metadata-materialized-inspection';readonly formatVersion:1;
 readonly scope:'native-client-cut-and-recorded-raster-payloads';
 readonly references:LocalMetadataReferenceCut;
 readonly rasters:Readonly<{bytes:number;sha256:string;payloads:readonly LocalMetadataRasterInfo[]}>;
 readonly recordedAvailability:Extract<LocalMetadataAssetAvailabilityRead,{kind:'checked'}>;
}
