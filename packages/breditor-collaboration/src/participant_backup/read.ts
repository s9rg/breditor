import {readRichAssetBackup,MAX_ASSET_BACKUP_BYTES,type RichAssetArchive} from "@breditor/experimental-rich-content";
import {readSharedAssetBytesBackup,type SharedAssetBytesArchive} from "../asset_bytes/read_backup.js";
import {MAX_SHARED_ASSET_BYTES_BACKUP_BYTES} from "../asset_bytes/format.js";
import {participantIdentity,participantSelection,participantSignal,checkParticipantSource,SharedParticipantBackupError} from "./policy.js";
import {SHARED_PARTICIPANT_BACKUP_MAGIC,SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES,SHARED_PARTICIPANT_BACKUP_MIME,MAX_SHARED_PARTICIPANT_BACKUP_BYTES,MAX_SHARED_PARTICIPANT_BACKUP_HEADER_BYTES,participantBody,participantDigest,type ParticipantHeader,type ParticipantSection} from "./format.js";
import type {SharedParticipantBackupSelection,SharedParticipantBackupOptions} from "./types.js";
import type {ParticipantState} from "./state.js";
function section(value:unknown,offset:number,max:number):ParticipantSection {
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="bytes,offset,sha256")throw new SharedParticipantBackupError("participant_format","Expected closed participant component ranges");const v=value as ParticipantSection;
 if(!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>max||v.offset!==offset||typeof v.sha256!=="string"||!/^[a-f0-9]{64}$/.test(v.sha256))throw new SharedParticipantBackupError("participant_format","Participant ranges must be complete contiguous bounded components");return {bytes:v.bytes,offset:v.offset,sha256:v.sha256};
}
export async function readParticipant(input:Blob,expected:SharedParticipantBackupSelection,options:SharedParticipantBackupOptions={}):Promise<ParticipantState>{
 const {signal,limits}={...options},selection=participantSelection(expected),assetOptions={...(signal?{signal}:{}),...(limits?{limits}:{})};participantSignal(signal);
 if(!(input instanceof Blob)||input.size<SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES||input.size>MAX_SHARED_PARTICIPANT_BACKUP_BYTES)throw new SharedParticipantBackupError("participant_budget","Participant file exceeds its complete framed budget");
 const file=new Blob([input],{type:SHARED_PARTICIPANT_BACKUP_MIME});if(await participantDigest(file,signal)!==selection.sha256)throw new SharedParticipantBackupError("participant_integrity","Participant file differs from its independently selected digest");
 const prefix=new Uint8Array(await file.slice(0,SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES).arrayBuffer());participantSignal(signal);
 if(SHARED_PARTICIPANT_BACKUP_MAGIC.some((b,i)=>prefix[i]!==b))throw new SharedParticipantBackupError("participant_format","Unknown participant framing");const length=new DataView(prefix.buffer).getUint32(SHARED_PARTICIPANT_BACKUP_MAGIC.length),bodyOffset=SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES+length;
 if(length<1||length>MAX_SHARED_PARTICIPANT_BACKUP_HEADER_BYTES||bodyOffset>file.size)throw new SharedParticipantBackupError("participant_budget","Participant header exceeds its budget");
 const encoded=new Uint8Array(await file.slice(SHARED_PARTICIPANT_BACKUP_PREFIX_BYTES,bodyOffset).arrayBuffer());let raw:unknown;
 try{raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(encoded));}catch{throw new SharedParticipantBackupError("participant_format","Participant header is not valid UTF-8 JSON");}
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).sort().join(",")!=="format,formatVersion,identity,selected,sha256,uploads")throw new SharedParticipantBackupError("participant_format","Expected the closed participant backup header");
 const r=raw as ParticipantHeader,identity=participantIdentity(r.identity);if(r.format!=="breditor/shared-participant-backup"||r.formatVersion!==1||JSON.stringify(identity)!==JSON.stringify(selection.identity))throw new SharedParticipantBackupError("participant_policy","Participant file differs from the explicit source policy");
 const a=section(r.selected,0,MAX_SHARED_ASSET_BYTES_BACKUP_BYTES),b=section(r.uploads,a.bytes,MAX_ASSET_BACKUP_BYTES),body=participantBody({format:r.format,formatVersion:r.formatVersion,identity,selected:a,uploads:b});
 if(a.bytes+b.bytes!==file.size-bodyOffset||await participantDigest(new Blob([JSON.stringify(body)]),signal)!==r.sha256||new TextDecoder().decode(encoded)!==JSON.stringify({...body,sha256:r.sha256}))throw new SharedParticipantBackupError("participant_integrity","Participant declarations differ from their exact canonical bytes");
 const selectedFile=file.slice(bodyOffset,bodyOffset+a.bytes),uploadFile=file.slice(bodyOffset+b.offset);
 if(await participantDigest(selectedFile,signal)!==a.sha256||await participantDigest(uploadFile,signal)!==b.sha256)throw new SharedParticipantBackupError("participant_integrity","Participant components differ from their exact digests");
 let selected:SharedAssetBytesArchive|undefined,uploads:RichAssetArchive|undefined,complete=false;
 try{selected=await readSharedAssetBytesBackup(selectedFile,assetOptions);uploads=await readRichAssetBackup(uploadFile,assetOptions);participantSignal(signal);checkParticipantSource(identity,selected.metadata(),selected.records());complete=true;return {file,header:{...body,sha256:r.sha256},selection,selected,uploads};}
 finally{if(!complete){selected?.dispose();uploads?.dispose();}}
}
