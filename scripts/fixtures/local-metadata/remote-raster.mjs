/** One additional exact valid PNG, uploaded to the real native service but
 * absent from every client upload archive. This tests a genuine remote-only
 * requirement; the fixture decoder is deliberately not a general decoder. */
import assert from 'node:assert/strict';import {deflateSync,inflateSync} from 'node:zlib';
import {ReviewFixtureImage,pixel} from '../review-assets/pixels.mjs';
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(kind,data){const name=Buffer.from(kind),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;const scanline=Buffer.from([0,15,45,235,255]);
export const remotePixel=Buffer.concat([pixel.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(scanline)),chunk('IEND',Buffer.alloc(0))]);
export class RemoteRasterFixtureImage extends ReviewFixtureImage{
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(remotePixel))return super.decode();const at=33;assert.equal(bytes.toString('ascii',at+4,at+8),'IDAT');assert.deepEqual(inflateSync(bytes.subarray(at+8,at+8+bytes.readUInt32BE(at)),{maxOutputLength:5}),scanline);this.naturalWidth=1;this.naturalHeight=1;}
}
