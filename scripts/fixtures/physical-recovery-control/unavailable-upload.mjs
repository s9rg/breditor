/** Exact valid 1x1 PNG with an additional checksummed ancillary chunk. Its
 * content ID is deliberately absent from the test-owned native provider. */
import {createHash} from 'node:crypto';
import {pixel,ReviewFixtureImage} from '../review-assets/pixels.mjs';
export function distinctFixturePng(label){
 const payload=Buffer.from('breditor\0'+label),kind=Buffer.from('tEXt'),body=Buffer.concat([kind,payload]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);let crc=0xffffffff;
 for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 length.writeUInt32BE(payload.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([pixel.subarray(0,-12),length,body,checksum,pixel.subarray(-12)]);
}
export const unavailableUpload=distinctFixturePng('local-unreferenced-upload');
export const unavailableAsset='sha256:'+createHash('sha256').update(unavailableUpload).digest('hex');
export const lostReplyUpload=distinctFixturePng('durable-upload-lost-reply');
export class UnavailableUploadImage extends ReviewFixtureImage{
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(unavailableUpload)&&!bytes.equals(lostReplyUpload))return super.decode();this.naturalWidth=1;this.naturalHeight=1;}
}
