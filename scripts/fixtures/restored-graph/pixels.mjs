/** Exact third PNG used only for input-only-byte laws; the old two-byte decoder stays strict. */
import assert from'node:assert/strict';import{createHash}from'node:crypto';import{deflateSync,inflateSync}from'node:zlib';import{pixel,ReviewFixtureImage}from'../review-assets/pixels.mjs';
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function chunk(kind,data){const name=Buffer.from(kind),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;const scanline=Buffer.from([0,40,90,220,255]);
export const thirdPixel=Buffer.concat([pixel.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(scanline)),chunk('IEND',Buffer.alloc(0))]);
export const thirdAsset='sha256:'+createHash('sha256').update(thirdPixel).digest('hex');
export class GraphFixtureImage extends ReviewFixtureImage{
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(thirdPixel))return super.decode();const at=33;assert.equal(bytes.toString('ascii',at+4,at+8),'IDAT');assert.deepEqual(inflateSync(bytes.subarray(at+8,at+8+bytes.readUInt32BE(at)),{maxOutputLength:5}),scanline);this.naturalWidth=1;this.naturalHeight=1;}
}
