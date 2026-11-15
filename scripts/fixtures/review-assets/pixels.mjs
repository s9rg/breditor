/** Exact 1×1 PNG fixtures. This decoder intentionally admits only these test bytes. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {deflateSync,inflateSync} from "node:zlib";
import {pixel,pixelAsset} from "../interchange-consumer/pixel.mjs";
export {pixel,pixelAsset};
function crc(bytes){let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(kind,data){const name=Buffer.from(kind),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
const scanline=Buffer.from([0,210,70,35,255]);
export const secondPixel=Buffer.concat([pixel.subarray(0,8),chunk("IHDR",header),chunk("IDAT",deflateSync(scanline)),chunk("IEND",Buffer.alloc(0))]);
export const secondAsset=`sha256:${createHash("sha256").update(secondPixel).digest("hex")}`;
const proposalScanline=Buffer.from([0,70,104,220,255]);
export const proposalPixel=Buffer.concat([pixel.subarray(0,8),chunk("IHDR",header),chunk("IDAT",deflateSync(proposalScanline)),chunk("IEND",Buffer.alloc(0))]);
export const proposalAsset=`sha256:${createHash("sha256").update(proposalPixel).digest("hex")}`;
export class ReviewFixtureImage {
 naturalWidth=0;naturalHeight=0;src="";
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());assert.ok(bytes.equals(pixel)||bytes.equals(secondPixel)||bytes.equals(proposalPixel),"Only exact fixture PNGs are decoded");const at=33;assert.equal(bytes.toString("ascii",at+4,at+8),"IDAT");assert.deepEqual(inflateSync(bytes.subarray(at+8,at+8+bytes.readUInt32BE(at)),{maxOutputLength:5}),bytes.equals(pixel)?Buffer.from([0,35,155,120,255]):bytes.equals(secondPixel)?scanline:proposalScanline);this.naturalWidth=1;this.naturalHeight=1;}
}
