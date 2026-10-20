/** Independent framing retains generation assets AND the exact complete upload-state file. */
import {MAX_ASSET_BACKUP_BYTES} from "@breditor/experimental-rich-content";
import {MAX_GENERATION_ASSET_BACKUP_BYTES} from "../generation_assets/codec.js";
import {checkAssetBytesSignal} from "../asset_bytes/guards.js";
import {assetBytesDigest} from "../asset_bytes/format.js";
import {generationParticipantIdentity,generationParticipantFailure} from "./policy.js";
import {generationFields} from "../generation_source/identity.js";
import type {SharedGenerationParticipantIdentity,SharedGenerationParticipantSelection} from "./contract.js";
export const GENERATION_PARTICIPANT_MIME="application/vnd.breditor.generation-participant-backup";
export const GENERATION_PARTICIPANT_MAGIC=new TextEncoder().encode("BREDITOR-GENERATION-PARTICIPANT1\n");
export const GENERATION_PARTICIPANT_PREFIX_BYTES=GENERATION_PARTICIPANT_MAGIC.length+4;
export const MAX_GENERATION_PARTICIPANT_HEADER_BYTES=256*1024;
export const MAX_GENERATION_PARTICIPANT_BYTES=GENERATION_PARTICIPANT_PREFIX_BYTES+MAX_GENERATION_PARTICIPANT_HEADER_BYTES+MAX_GENERATION_ASSET_BACKUP_BYTES+MAX_ASSET_BACKUP_BYTES;
export interface GenerationParticipantSection{bytes:number;offset:number;sha256:string}
export interface GenerationParticipantHeader{format:"breditor/shared-generation-participant-backup";formatVersion:1;identity:SharedGenerationParticipantIdentity;selected:GenerationParticipantSection;uploads:GenerationParticipantSection;sha256:string}
export const generationParticipantBody=(identity:SharedGenerationParticipantIdentity,selected:GenerationParticipantSection,uploads:GenerationParticipantSection)=>({format:"breditor/shared-generation-participant-backup" as const,formatVersion:1 as const,identity,selected,uploads});
export async function generationParticipantDigest(file:Blob,signal?:AbortSignal):Promise<string>{checkAssetBytesSignal(signal);if(!(file instanceof Blob)||file.size>MAX_GENERATION_PARTICIPANT_BYTES)throw generationParticipantFailure("generation_participant_budget");const bytes=new Uint8Array(await file.arrayBuffer());checkAssetBytesSignal(signal);const digest=await assetBytesDigest(bytes);checkAssetBytesSignal(signal);return digest;}
export async function encodeGenerationParticipant(identity:SharedGenerationParticipantIdentity,selected:Blob,uploads:Blob,signal?:AbortSignal):Promise<{file:Blob;header:GenerationParticipantHeader;selection:SharedGenerationParticipantSelection}>{
 const a=await generationParticipantDigest(selected,signal),b=await generationParticipantDigest(uploads,signal),body=generationParticipantBody(identity,{bytes:selected.size,offset:0,sha256:a},{bytes:uploads.size,offset:selected.size,sha256:b}),sha256=await generationParticipantDigest(new Blob([JSON.stringify(body)]),signal),header={...body,sha256},encoded=new TextEncoder().encode(JSON.stringify(header));if(encoded.length>MAX_GENERATION_PARTICIPANT_HEADER_BYTES)throw generationParticipantFailure("generation_participant_budget");
 const prefix=new Uint8Array(GENERATION_PARTICIPANT_PREFIX_BYTES);prefix.set(GENERATION_PARTICIPANT_MAGIC);new DataView(prefix.buffer).setUint32(GENERATION_PARTICIPANT_MAGIC.length,encoded.length);const file=new Blob([prefix,encoded,selected,uploads],{type:GENERATION_PARTICIPANT_MIME});return{file,header,selection:{identity,sha256:await generationParticipantDigest(file,signal)}};
}
export function readGenerationParticipantHeader(raw:unknown,expected:SharedGenerationParticipantSelection,bodyBytes:number):GenerationParticipantHeader{
 if(!generationFields(raw,"format,formatVersion,identity,selected,sha256,uploads"))throw generationParticipantFailure("generation_participant_format");const h=raw as unknown as GenerationParticipantHeader,identity=generationParticipantIdentity(h.identity);if(h.format!=="breditor/shared-generation-participant-backup"||h.formatVersion!==1||JSON.stringify(identity)!==JSON.stringify(expected.identity)||typeof h.sha256!=="string"||!/^[a-f0-9]{64}$/.test(h.sha256))throw generationParticipantFailure("generation_participant_policy");
 const section=(v:GenerationParticipantSection,offset:number,max:number):GenerationParticipantSection=>{if(!generationFields(v,"bytes,offset,sha256")||!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>max||v.offset!==offset||typeof v.sha256!=="string"||!/^[a-f0-9]{64}$/.test(v.sha256))throw generationParticipantFailure("generation_participant_format");return{bytes:v.bytes,offset,sha256:v.sha256};};const a=section(h.selected,0,MAX_GENERATION_ASSET_BACKUP_BYTES),b=section(h.uploads,a.bytes,MAX_ASSET_BACKUP_BYTES);if(a.bytes+b.bytes!==bodyBytes)throw generationParticipantFailure("generation_participant_integrity");return {...generationParticipantBody(identity,a,b),sha256:h.sha256};
}
