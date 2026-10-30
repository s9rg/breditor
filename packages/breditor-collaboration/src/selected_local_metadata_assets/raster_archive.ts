/** Original V1 raster reader. It retains the exact recorded-provider scope;
 * the separately named V2 reader admits a complete local/provider byte union. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataRasterHeader,LocalMetadataRasterInfo} from './materialization_contract.js';
import {readLocalMetadataRasterFrame,encodeLocalMetadataRasterFrame} from './raster_frame.js';
import {fail} from './error.js';
const key=Object.freeze({});
export class LocalMetadataRasterArchive {
 readonly #header;readonly #file;#payloads:ReadonlyMap<string,Blob>|undefined;
 private constructor(token:object,header:LocalMetadataRasterHeader,file:Blob,payloads:ReadonlyMap<string,Blob>){if(token!==key)throw fail('local_metadata_assets_state');this.#header=header;this.#file=file;this.#payloads=payloads;Object.freeze(this);}
 metadata():LocalMetadataRasterHeader{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#header;}
 payload(asset:string):Blob|undefined{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#payloads.get(asset);}
 file():Blob{if(!this.#payloads)throw fail('local_metadata_assets_closed');return this.#file;}
 dispose():void{this.#payloads=undefined;}
 static async read(input:Blob,expected:Readonly<{bytes:number;sha256:string}>,options:SharedArchiveIntegrityOptions,limits:Partial<AssetLimits>={}):Promise<LocalMetadataRasterArchive>{
  const admitted=await readLocalMetadataRasterFrame(input,expected,options,limits,1);if(admitted.header.formatVersion!==1)throw fail('local_metadata_assets_state');
  return new LocalMetadataRasterArchive(key,admitted.header,admitted.file,admitted.payloads);
 }
}
export function encodeLocalMetadataRasters(references:Readonly<{bytes:number;sha256:string}>,availability:unknown,payloads:readonly Readonly<{info:LocalMetadataRasterInfo;blob:Blob}>[],options:SharedArchiveIntegrityOptions,limits:Partial<AssetLimits>={}){
 return encodeLocalMetadataRasterFrame(1,references,availability,payloads,options,limits);
}
