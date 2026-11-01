
/** A fourth exact valid raster. It is published only inside an intermediate
 * remote suggestion command and never enters any selected local upload store. */
import assert from 'node:assert/strict';import {deflateSync,inflateSync} from 'node:zlib';
import {pixel} from '../review-assets/pixels.mjs';
import {RemoteRasterFixtureImage} from './remote-raster.mjs';
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(kind,data){const name=Buffer.from(kind),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;const scanline=Buffer.from([0,165,25,195,255]);
export const packetPixel=Buffer.concat([pixel.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(scanline)),chunk('IEND',Buffer.alloc(0))]);
export class PacketRasterFixtureImage extends RemoteRasterFixtureImage{
 async decode(){const bytes=Buffer.from(await(await fetch(this.src)).arrayBuffer());if(!bytes.equals(packetPixel))return super.decode();const at=33;assert.equal(bytes.toString('ascii',at+4,at+8),'IDAT');assert.deepEqual(inflateSync(bytes.subarray(at+8,at+8+bytes.readUInt32BE(at)),{maxOutputLength:5}),scanline);this.naturalWidth=1;this.naturalHeight=1;}
}
export function packetImageDraft(core,asset){let image;const visit=node=>{if(!image&&node.type==='breditor/image')image=node;for(const child of node.children??[])visit(child);};visit(JSON.parse(core.documentJson()).root);assert.ok(image);const block=image.properties['breditor/block-id'],original=image.properties['breditor/asset-id'];return {scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block,asset,generation:'remote-packet-only-intermediate-g'}},{kind:'replace_image',data:{block,asset:original,generation:'remote-packet-original-again-g'}}]}};}
