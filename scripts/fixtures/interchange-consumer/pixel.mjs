/** Small deterministic raster fixture; not a browser decoder substitute for arbitrary images. */
import assert from "node:assert/strict";
import {deflateSync,inflateSync} from "node:zlib";
import {createHash} from "node:crypto";
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(kind,payload){const name=Buffer.from(kind),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(payload.length);sum.writeUInt32BE(crc(Buffer.concat([name,payload])));return Buffer.concat([size,name,payload,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
export const pixel=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.from([0,35,155,120,255]))),chunk("IEND",Buffer.alloc(0))]);
export const pixelAsset=`sha256:${createHash("sha256").update(pixel).digest("hex")}`;
export class FixtureImage {
 naturalWidth=0;naturalHeight=0;src="";
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());assert.deepEqual(bytes,pixel);const start=8+12+13;assert.equal(bytes.toString("ascii",start+4,start+8),"IDAT");assert.deepEqual(inflateSync(bytes.subarray(start+8,start+8+bytes.readUInt32BE(start)),{maxOutputLength:5}),Buffer.from([0,35,155,120,255]));this.naturalWidth=1;this.naturalHeight=1;}
}
