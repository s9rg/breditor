/** Pure generation asset framing shared by genuine captures and reconstruction
 * DATA. The output grants no native source, author lease or activation. Native
 * record strings remain opaque; their numbers and effect bytes are never rebuilt.
 */
import {checkAssetBytesSignal,SharedAssetBytesError} from '../asset_bytes/guards.js';
import {generationAssetBody,generationAssetDigest,generationAssetUtf8,GENERATION_ASSET_MIME,GENERATION_ASSET_MAGIC,GENERATION_ASSET_PREFIX_BYTES,MAX_GENERATION_ASSET_HEADER_BYTES,MAX_GENERATION_ASSET_BACKUP_BYTES,type GenerationAssetHeader} from './codec.js';
import type {GenerationAssetSnapshot} from './types.js';
export async function encodeGenerationAssetData(snapshot:GenerationAssetSnapshot,guard:()=>void,signal?:AbortSignal):Promise<Blob>{
 const check=()=>{checkAssetBytesSignal(signal);guard();checkAssetBytesSignal(signal);};check();
 const parts:BlobPart[]=[],records:GenerationAssetHeader['records'][number][]=[],assets:GenerationAssetHeader['assets'][number][]=[];let offset=0;
 for(const r of snapshot.records){check();const bytes=generationAssetUtf8(r.json,MAX_GENERATION_ASSET_BACKUP_BYTES),sha256=await generationAssetDigest(bytes);check();records.push({kind:r.kind,index:r.index,bytes:bytes.length,offset,sha256});parts.push(bytes);offset+=bytes.length;}
 if(offset!==snapshot.metadata.sourceBytes)throw new SharedAssetBytesError('asset_bytes_integrity','Generation source byte counts differ');
 for(const a of snapshot.metadata.assets){const blob=snapshot.payloads.get(a.contentAsset);if(!blob||blob.size!==a.bytes||blob.type!==a.mime)throw new SharedAssetBytesError('asset_bytes_closed','Generation asset capture is closed or was not created by this SDK');assets.push({...a,offset});parts.push(blob);offset+=a.bytes;}
 const body=generationAssetBody(snapshot.metadata,records,assets),sha256=await generationAssetDigest(generationAssetUtf8(JSON.stringify(body),MAX_GENERATION_ASSET_HEADER_BYTES));check();
 const header=generationAssetUtf8(JSON.stringify({...body,sha256}),MAX_GENERATION_ASSET_HEADER_BYTES),prefix=new Uint8Array(GENERATION_ASSET_PREFIX_BYTES);prefix.set(GENERATION_ASSET_MAGIC);new DataView(prefix.buffer).setUint32(GENERATION_ASSET_MAGIC.length,header.length);
 const file=new Blob([prefix,header,...parts],{type:GENERATION_ASSET_MIME});if(file.size>MAX_GENERATION_ASSET_BACKUP_BYTES)throw new SharedAssetBytesError('asset_bytes_budget','Generation asset file exceeds its explicit complete budget');check();return file;
}
