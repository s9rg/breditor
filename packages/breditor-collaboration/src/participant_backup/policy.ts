import {backupIdentity} from "../backups/identity.js";
import {checkBackupCheckpoint} from "../backups/session.js";
import {readPairedBackupRecord} from "../backups/paired.js";
import type {SharedAssetCaptureRecord,SharedAssetReferenceCaptureMetadata} from "../asset_references_capture.js";
import type {SharedParticipantBackupIdentity,SharedParticipantBackupSelection} from "./types.js";
export class SharedParticipantBackupError extends Error {
 constructor(readonly code:"participant_policy"|"participant_source"|"participant_authority"|"participant_format"|"participant_integrity"|"participant_budget"|"participant_aborted"|"participant_closed",message:string){super(message);this.name="SharedParticipantBackupError";}
}
const kinds=["document","paired-session","version-catalog","suggestions","suggestion-revisions"] as const;
const fail=()=>new SharedParticipantBackupError("participant_policy","Choose one complete explicit participant and source policy");
function keys(value:unknown,expected:string):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===expected;}
function name(value:unknown,max:number):value is string{return typeof value==="string"&&value.length>0&&new TextEncoder().encode(value).length<=max&&new TextDecoder("utf-8",{fatal:true}).decode(new TextEncoder().encode(value))===value;}
export function participantIdentity(value:unknown):Readonly<SharedParticipantBackupIdentity>{
 try{
 if(!keys(value,"assets,participant,principal,source,stores"))throw fail();const r=value as unknown as SharedParticipantBackupIdentity;
 if(!name(r.participant,200)||!name(r.principal,128)||r.assets!=="whole-store"||!Array.isArray(r.stores)||r.stores[0]!=="document"||r.stores.length>5)throw fail();
 let previous=-1;for(const store of r.stores){const index=kinds.indexOf(store);if(index<=previous)throw fail();previous=index;}
 if(r.stores.includes("suggestion-revisions")&&!r.stores.includes("suggestions"))throw fail();
 let source:ReturnType<typeof backupIdentity>;try{source=backupIdentity(r.source);}catch{throw fail();}
 return Object.freeze({participant:r.participant,principal:r.principal,source,stores:Object.freeze([...r.stores]),assets:"whole-store"});
 }catch{throw fail();}
}
export function participantSelection(value:unknown):Readonly<SharedParticipantBackupSelection>{
 try{
 if(!keys(value,"identity,sha256"))throw fail();const r=value as unknown as SharedParticipantBackupSelection;if(typeof r.sha256!=="string"||!/^[a-f0-9]{64}$/.test(r.sha256))throw fail();return Object.freeze({identity:participantIdentity(r.identity),sha256:r.sha256});
 }catch{throw fail();}
}
export function participantSignal(signal?:AbortSignal):void{if(signal?.aborted)throw new SharedParticipantBackupError("participant_aborted","Participant backup work was cancelled");}
export function participantAuthority(check:()=>void):()=>void{
 if(typeof check!=="function")throw new SharedParticipantBackupError("participant_authority","An explicit synchronous host authority check is required");
 return()=>{let value:unknown;try{value=check();if(value!==undefined){if(value&&(typeof value==="object"||typeof value==="function")&&typeof(value as {then?:unknown}).then==="function")void Promise.resolve(value).catch(()=>{});throw Error();}}catch{throw new SharedParticipantBackupError("participant_authority","The host participant authority check did not hold synchronously");}};
}
export function checkParticipantSource(identity:SharedParticipantBackupIdentity,metadata:Pick<SharedAssetReferenceCaptureMetadata,"document">&Partial<Pick<SharedAssetReferenceCaptureMetadata,"sources">>,records:readonly SharedAssetCaptureRecord[]):void{
 try{
  if(metadata.document!==identity.source.room||metadata.sources&&JSON.stringify(metadata.sources.map(s=>s.kind))!==JSON.stringify(identity.stores)||JSON.stringify(records.map(s=>s.kind))!==JSON.stringify(identity.stores))throw Error();
  const document=records[0];if(!document||document.kind!=="document")throw Error();const paired=records.find(r=>r.kind==="paired-session");
  if(paired){const value=readPairedBackupRecord(paired.json,identity.source);if(value.documentCheckpointJson!==document.json)throw Error();}
  else checkBackupCheckpoint(document.json,identity.source);
 }catch{throw new SharedParticipantBackupError("participant_source","Captured records differ from the explicit participant source policy");}
}
