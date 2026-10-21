/** Opaque outer transport fixture only: random component bytes are not native replay/raster proof. */
import {createHash} from 'node:crypto';
export const digest=bytes=>[...createHash('sha256').update(bytes).digest()];
export const magic=new TextEncoder().encode('BREDITOR-SERVER-GENERATIONS1\n');
export function transportFixture({nativeBytes=Uint8Array.of(1,2,3),rasters=Uint8Array.of(4,5),change,encode=JSON.stringify}={}){
 const binding='sha256:'+'a'.repeat(64),source={document:'room',owner:'owner',assetBinding:binding,profile:{kind:'layoutV3',standardInlineV1:true},writerTransportVersion:2,records:8193,terminalLogDigest:Array(32).fill(0)},native={source,manifest:Array(32).fill(9),archiveSha256:digest(nativeBytes)},assets={binding,archiveSha256:digest(rasters),assets:0,bytes:0};
 const header={format:'breditor/server-log-generation-room-backup',formatVersion:1,native,assets,log:{offset:0,bytes:nativeBytes.length,sha256:digest(nativeBytes)},rasters:{offset:nativeBytes.length,bytes:rasters.length,sha256:digest(rasters)}};change?.(header);
 const text=encode(header),encoded=new TextEncoder().encode(text),prefix=new Uint8Array(magic.length+4+32);prefix.set(magic);new DataView(prefix.buffer).setUint32(magic.length,encoded.length);prefix.set(digest(encoded),magic.length+4);
 const bytes=Buffer.concat([prefix,encoded,nativeBytes,rasters]),file=new Blob([bytes]),expected={native:structuredClone(header.native),assets:structuredClone(header.assets),archiveSha256:digest(bytes)};
 return{file,expected,bytes,header,prefix,encoded};
}
