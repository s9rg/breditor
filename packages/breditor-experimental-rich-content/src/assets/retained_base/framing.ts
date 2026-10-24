/** Independent canonical framing; old raster and reconciliation formats stay V1.
 * Lengths are checked before JSON/raster admission. No storage is opened here. */
import {MAX_ASSET_BACKUP_BYTES} from '../archive/codec.js';
import {MAX_ASSET_BACKUP_HEADER_BYTES} from '../archive/types.js';
import {checkedAssetLimits} from '../limits.js';
import {ASSET_BASE_MIME,RichAssetBaseError,type RichAssetBaseMetadata,type RichAssetBasePart} from './contract.js';
const magic=new TextEncoder().encode('BREDITOR-ASSET-BASE1\n'),prefixBytes=magic.length+4;
export const assetBaseParts=Object.freeze(['current','original','selected'] as const);
export const MAX_ASSET_BASE_BYTES=prefixBytes+MAX_ASSET_BACKUP_HEADER_BYTES+3*MAX_ASSET_BACKUP_BYTES;
const invalid=()=>new RichAssetBaseError('asset_base_format','Expected the complete canonical reconciled asset base V1');
export const checkAssetBaseSignal=(signal?:AbortSignal):void=>{if(signal?.aborted)throw new RichAssetBaseError('asset_base_aborted','Retained asset base admission was cancelled');};
export async function assetBaseDigest(file:Blob,check:()=>void):Promise<string>{check();const bytes=await file.arrayBuffer();check();const hash=await crypto.subtle.digest('SHA-256',bytes);check();return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function keys(value:unknown,names:string):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===names;}
function metadata(value:unknown):RichAssetBaseMetadata {
 if(!keys(value,'choices,files,format,formatVersion,limits,sha256,sourceDatabase'))throw invalid();
 const r=value as unknown as RichAssetBaseMetadata;
 if(r.format!=='breditor/reconciled-asset-base'||r.formatVersion!==1||typeof r.sourceDatabase!=='string'||!r.sourceDatabase||r.sourceDatabase.length>200||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||!Array.isArray(r.choices)||!keys(r.files,'current,original,selected')||!keys(r.limits,'maxDimension,maxFileBytes,maxPixels,maxStoredBytes'))throw invalid();
 try{checkedAssetLimits(r.limits);}catch{throw invalid();}
 let previous='';for(const choice of r.choices){if(!keys(choice,'asset,keep')||typeof choice.asset!=='string'||!/^sha256:[a-f0-9]{64}$/.test(choice.asset)||choice.asset<=previous||!['current','original'].includes(choice.keep))throw invalid();previous=choice.asset;}
 for(const part of assetBaseParts){const f=r.files[part];if(!keys(f,'bytes,sha256')||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>MAX_ASSET_BACKUP_BYTES||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))throw invalid();}
 return {format:r.format,formatVersion:1,sourceDatabase:r.sourceDatabase,limits:checkedAssetLimits(r.limits),choices:r.choices.map(c=>({asset:c.asset,keep:c.keep})),files:{current:{...r.files.current},original:{...r.files.original},selected:{...r.files.selected}},sha256:r.sha256};
}
export async function encodeAssetBase(sourceDatabase:string,limits:RichAssetBaseMetadata['limits'],choices:RichAssetBaseMetadata['choices'],files:Readonly<Record<RichAssetBasePart,Blob>>,check:()=>void):Promise<Blob>{
 const pins={} as Record<RichAssetBasePart,{bytes:number;sha256:string}>;
 for(const part of assetBaseParts){check();if(!(files[part] instanceof Blob)||files[part].size<1||files[part].size>MAX_ASSET_BACKUP_BYTES)throw new RichAssetBaseError('asset_base_budget','Retained asset base component exceeds its archive budget');pins[part]={bytes:files[part].size,sha256:await assetBaseDigest(files[part],check)};}
 const body={format:'breditor/reconciled-asset-base' as const,formatVersion:1 as const,sourceDatabase,limits,choices,files:pins};
 const sha256=await assetBaseDigest(new Blob([JSON.stringify(body)]),check),header=metadata({...body,sha256}),bytes=new TextEncoder().encode(JSON.stringify(header));
 if(bytes.length>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBaseError('asset_base_budget','Retained asset base metadata exceeds its byte budget');
 const prefix=new Uint8Array(prefixBytes);prefix.set(magic);new DataView(prefix.buffer).setUint32(magic.length,bytes.length);check();return new Blob([prefix,bytes,...assetBaseParts.map(part=>files[part])],{type:ASSET_BASE_MIME});
}
export async function readAssetBaseFrame(file:Blob,check:()=>void):Promise<{metadata:RichAssetBaseMetadata;files:Readonly<Record<RichAssetBasePart,Blob>>}>{
 check();if(!(file instanceof Blob)||file.size<prefixBytes||file.size>MAX_ASSET_BASE_BYTES)throw new RichAssetBaseError('asset_base_budget','Retained asset base exceeds its framed byte budget');
 const prefix=new Uint8Array(await file.slice(0,prefixBytes).arrayBuffer());check();if(magic.some((v,i)=>prefix[i]!==v))throw invalid();
 const length=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length);if(length<1||length>MAX_ASSET_BACKUP_HEADER_BYTES||prefixBytes+length>file.size)throw new RichAssetBaseError('asset_base_budget','Retained asset base header exceeds its byte budget');
 const bytes=new Uint8Array(await file.slice(prefixBytes,prefixBytes+length).arrayBuffer());check();let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw invalid();}
 const m=metadata(value),canonical=new TextEncoder().encode(JSON.stringify(m));if(canonical.length!==bytes.length||canonical.some((v,i)=>v!==bytes[i]))throw invalid();
 const{sha256,...body}=m;if(await assetBaseDigest(new Blob([JSON.stringify(body)]),check)!==sha256)throw new RichAssetBaseError('asset_base_integrity','Retained asset base metadata changed');
 const files={} as Record<RichAssetBasePart,Blob>;let offset=prefixBytes+length;
 for(const part of assetBaseParts){const pin=m.files[part];if(offset+pin.bytes>file.size)throw invalid();files[part]=file.slice(offset,offset+pin.bytes,'application/vnd.breditor.raster-assets');offset+=pin.bytes;}
 if(offset!==file.size)throw invalid();for(const part of assetBaseParts)if(await assetBaseDigest(files[part],check)!==m.files[part].sha256)throw new RichAssetBaseError('asset_base_integrity','A retained asset base component changed');check();return{metadata:m,files};
}
