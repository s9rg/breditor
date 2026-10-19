import {MAX_ASSET_BACKUP_BYTES} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_BYTES_BACKUP_BYTES} from "../asset_bytes/format.js";
import {participantSignal,SharedParticipantBackupError} from "./policy.js";
import type {SharedParticipantBackupIdentity,SharedParticipantBackupSelection} from "./types.js";
export const SHARED_PARTICIPANT_BACKUP_MIME="application/vnd.breditor.shared-participant-backup";
export const SHARED_PARTICIPANT_BACKUP_MAGIC=new TextEncoder().encode("BREDITOR-PARTICIPANT1\n");
export const SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES=SHARED_PARTICIPANT_BACKUP_MAGIC.length+4;
export const MAX_SHARED_PARTICIPANT_BACKUP_HEADER_BYTES=16*1024;
export const MAX_SHARED_PARTICIPANT_BACKUP_BYTES=SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES+MAX_SHARED_PARTICIPANT_BACKUP_HEADER_BYTES+MAX_SHARED_ASSET_BYTES_BACKUP_BYTES+MAX_ASSET_BACKUP_BYTES;
export interface ParticipantSection {bytes:number;offset:number;sha256:string}
export interface ParticipantHeader {format:"breditor/shared-participant-backup";formatVersion:1;identity:SharedParticipantBackupIdentity;selected:ParticipantSection;uploads:ParticipantSection;sha256:string}
export function participantBody(header:Omit<ParticipantHeader,"sha256">){return {format:header.format,formatVersion:header.formatVersion,identity:header.identity,selected:header.selected,uploads:header.uploads};}
export async function participantDigest(file:Blob,signal?:AbortSignal):Promise<string>{
 participantSignal(signal);if(file.size>MAX_SHARED_PARTICIPANT_BACKUP_BYTES)throw new SharedParticipantBackupError("participant_budget","Participant bytes exceed their complete framed budget");
 if(!globalThis.crypto?.subtle)throw new SharedParticipantBackupError("participant_policy","Participant backups require Web Crypto SHA-256");
 const bytes=await file.arrayBuffer();participantSignal(signal);const digest=await crypto.subtle.digest("SHA-256",bytes);participantSignal(signal);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function encodeParticipantFile(identity:SharedParticipantBackupIdentity,selected:Blob,uploads:Blob,signal?:AbortSignal):Promise<{file:Blob;header:ParticipantHeader;selection:SharedParticipantBackupSelection}>{
 const selectedHash=await participantDigest(selected,signal),uploadHash=await participantDigest(uploads,signal);
 const body=participantBody({format:"breditor/shared-participant-backup",formatVersion:1,identity,selected:{bytes:selected.size,offset:0,sha256:selectedHash},uploads:{bytes:uploads.size,offset:selected.size,sha256:uploadHash}});
 const sha256=await participantDigest(new Blob([JSON.stringify(body)]),signal),header={...body,sha256},encoded=new TextEncoder().encode(JSON.stringify(header));
 if(encoded.length>MAX_SHARED_PARTICIPANT_BACKUP_HEADER_BYTES)throw new SharedParticipantBackupError("participant_budget","Participant metadata exceeds its header budget");
 const prefix=new Uint8Array(SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES);prefix.set(SHARED_PARTICIPANT_BACKUP_MAGIC);new DataView(prefix.buffer).setUint32(SHARED_PARTICIPANT_BACKUP_MAGIC.length,encoded.length);
 const file=new Blob([prefix,encoded,selected,uploads],{type:SHARED_PARTICIPANT_BACKUP_MIME});return {file,header,selection:Object.freeze({identity,sha256:await participantDigest(file,signal)})};
}
