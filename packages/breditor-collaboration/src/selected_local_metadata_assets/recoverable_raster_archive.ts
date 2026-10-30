/** Separately framed V2 union. Admitting payload bytes supplies no Native
 * provenance, upload acknowledgement or current opaque mapping authority. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataRecoverableRasterHeader} from './recoverable_contract.js';
import type {LocalMetadataRasterInfo} from './materialization_contract.js';
import {readLocalMetadataRasterFrame,encodeLocalMetadataRasterFrame} from './raster_frame.js';
import {fail} from './error.js';
const key=Object.freeze({});
export class LocalMetadataRecoverableRasterArchive {
 readonly #header;readonly #file;#payloads:ReadonlyMap<string,Blob>|undefined;
 private constructor(token:object,header:LocalMetadataRecoverableRasterHeader,file:Blob,payloads:ReadonlyMap<string,Blob>){if(token!==key)throw fail('local_metadata_assets_state');this.#header=header;this.#file=file;this.#payloads=payloads;Object.freeze(this);}
 metadata():LocalMetadataRecoverableRasterHeader{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#header;}
 payload(asset:string):Blob|undefined{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#payloads.get(asset);}
 file():Blob{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#file;}
 dispose():void{this.#payloads=undefined;}
 static async read(input:Blob,expected:Readonly<{bytes:number;sha256:string}>,options:SharedArchiveIntegrityOptions,limits:Partial<AssetLimits>={}):Promise<LocalMetadataRecoverableRasterArchive>{
  const admitted=await readLocalMetadataRasterFrame(input,expected,options,limits,2);if(admitted.header.formatVersion!==2)throw fail('local_metadata_assets_state');
  return new LocalMetadataRecoverableRasterArchive(key,admitted.header,admitted.file,admitted.payloads);
 }
}
export function encodeLocalMetadataRecoverableRasters(references:Readonly<{bytes:number;sha256:string}>,availability:unknown,payloads:readonly Readonly<{info:LocalMetadataRasterInfo;blob:Blob}>[],options:SharedArchiveIntegrityOptions,limits:Partial<AssetLimits>={}){
 return encodeLocalMetadataRasterFrame(2,references,availability,payloads,options,limits);
}
