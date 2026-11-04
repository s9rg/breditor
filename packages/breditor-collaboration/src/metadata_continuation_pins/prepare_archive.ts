/** Detach the closed archive DTO and own native Blob slices synchronously.
 * Public subclass size/type/read accessors never select the admitted bytes. */
import {fields} from '../physical_room_record_cut/policy.js';
import {metadataContinuationEvidencePins} from './identity.js';
import {metadataPinsFailure as fail} from './policy.js';
import type {MetadataContinuationPinArchive,MetadataSnapshotPin} from './contract.js';
function body(input:unknown,pin:MetadataSnapshotPin|null):Blob|null{
 if(pin===null){if(input!==null)throw fail();return null;}
 let file:Blob;
 try{
  if(!(input instanceof Blob)||Object.getOwnPropertyDescriptor(Blob.prototype,'size')?.get?.call(input)!==pin.bytes)throw fail();
  file=Blob.prototype.slice.call(input,0,pin.bytes,'application/json') as Blob;
 }catch{throw fail();}
 if(file.size!==pin.bytes)throw fail();return Object.freeze(file);
}
export function prepareMetadataPinArchive(input:unknown):MetadataContinuationPinArchive{
 const r=fields(input,['format','formatVersion','pins','review','metadata']);
 if(r['format']!=='breditor/metadata-continuation-pin-archive'||r['formatVersion']!==1)throw fail();
 const pins=metadataContinuationEvidencePins(r['pins']);
 return Object.freeze({format:'breditor/metadata-continuation-pin-archive',formatVersion:1,pins,review:body(r['review'],pins.review),metadata:body(r['metadata'],pins.metadata)});
}
