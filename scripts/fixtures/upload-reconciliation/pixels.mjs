/** A fourth exact PNG for current-only upload retention, not a general image decoder. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {pixel} from "../review-assets/pixels.mjs";
import {ParticipantFixtureImage} from "../review-assets/participant-pixels.mjs";
const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
const data=Buffer.from("breditor\0current only retained image"),kind=Buffer.from("tEXt"),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([kind,data])));
export const fourthPixel=Buffer.concat([pixel.subarray(0,-12),length,kind,data,checksum,pixel.subarray(-12)]);
export const fourthAsset=`sha256:${createHash("sha256").update(fourthPixel).digest("hex")}`;
export class UploadReconciliationImage extends ParticipantFixtureImage {
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(fourthPixel))return super.decode();let at=8;while(at<bytes.length){const size=bytes.readUInt32BE(at);assert.equal(crc(bytes.subarray(at+4,at+8+size)),bytes.readUInt32BE(at+8+size));at+=size+12;}assert.equal(at,bytes.length);this.naturalWidth=1;this.naturalHeight=1;}
}
