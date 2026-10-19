/** One additional valid PNG with an unreferenced metadata chunk; only exact fixtures decode here. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {inflateSync} from "node:zlib";
import {pixel,ReviewFixtureImage} from "./pixels.mjs";
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
const text=Buffer.from("breditor\0unreferenced pending upload"),type=Buffer.from("tEXt"),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(text.length);checksum.writeUInt32BE(crc(Buffer.concat([type,text])));
export const thirdPixel=Buffer.concat([pixel.subarray(0,-12),length,type,text,checksum,pixel.subarray(-12)]);
export const thirdAsset=`sha256:${createHash("sha256").update(thirdPixel).digest("hex")}`;
export class ParticipantFixtureImage extends ReviewFixtureImage {
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(thirdPixel))return super.decode();
  const image=[];let at=8;while(at<bytes.length){const size=bytes.readUInt32BE(at),kind=bytes.toString("ascii",at+4,at+8),body=bytes.subarray(at+8,at+8+size);assert.equal(crc(bytes.subarray(at+4,at+8+size)),bytes.readUInt32BE(at+8+size));if(kind==="IDAT")image.push(body);at+=size+12;}
  assert.equal(at,bytes.length);assert.deepEqual(inflateSync(Buffer.concat(image),{maxOutputLength:5}),Buffer.from([0,35,155,120,255]));this.naturalWidth=1;this.naturalHeight=1;
 }
}
