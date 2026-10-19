import {RichAssetStore,readRichAssetBackup,type RichAssetArchive} from "@breditor/experimental-rich-content";
import {captureSharedAssetReferences,type SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {captureSharedAssetBytes,type SharedAssetBytesCapture} from "../asset_bytes/capture.js";
import {exportSharedAssetBytesBackup} from "../asset_bytes/export_backup.js";
import {readSharedAssetBytesBackup,type SharedAssetBytesArchive} from "../asset_bytes/read_backup.js";
import {assetBytesSource} from "../asset_bytes/guards.js";
import {checkParticipantSource,participantIdentity,participantAuthority,participantSignal} from "./policy.js";
import {encodeParticipantFile} from "./format.js";
import type {SharedParticipantBackupCaptureOptions,SharedParticipantBackupPending} from "./types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {ParticipantState} from "./state.js";
const captureAssets=RichAssetStore.prototype.captureBackup;
export async function captureParticipant<P extends SharedSelectionPolicy>(input:SharedParticipantBackupCaptureOptions<P>):Promise<{kind:"ready";state:ParticipantState}|{kind:"pending";pending:SharedParticipantBackupPending}>{
 const {identity:supplied,source:provided,assets,checkAuthority,resolveAsset,signal,limits}={...input},identity=participantIdentity(supplied),source={...provided},authority=participantAuthority(checkAuthority),guard=()=>{participantSignal(signal);authority();},abortOptions=signal?{signal}:{},assetOptions={...abortOptions,...(limits?{limits}:{})};
 let native:SharedAssetReferenceCapture|undefined,uploads:RichAssetArchive|undefined,bytes:SharedAssetBytesCapture|undefined,selected:SharedAssetBytesArchive|undefined,transferred=false;
 try{
  guard();const cut=await captureAssets.call(assets,()=>{guard();native=captureSharedAssetReferences(source);const value=assetBytesSource(native);checkParticipantSource(identity,value.metadata,value.records);guard();return native;},abortOptions);
  guard();const original=assetBytesSource(native!);original.check();
  if(original.metadata.outcome.kind==="pending")return {kind:"pending",pending:Object.freeze([Object.freeze({kind:"source",pending:original.metadata.outcome.pending})])};
  uploads=await readRichAssetBackup(cut.backup,assetOptions);guard();original.check();const local=uploads;
  const result=await captureSharedAssetBytes({source:native!,...assetOptions,resolveAsset:async(reference,abort)=>{
   guard();original.check();const blob=local.blob(reference.asset);
   if(blob)return {asset:reference.asset,generation:reference.generation,identity:"content-addressed",blob,check(){guard();local.backup();}};
   return resolveAsset?await resolveAsset(reference,abort):undefined;
  }});guard();original.check();if(result.kind==="pending")return result;bytes=result.capture;
  const file=await exportSharedAssetBytesBackup(bytes,abortOptions);guard();original.check();selected=await readSharedAssetBytesBackup(file,assetOptions);guard();original.check();
  const encoded=await encodeParticipantFile(identity,file,cut.backup,signal);guard();original.check();
  transferred=true;return {kind:"ready",state:{...encoded,selected,uploads}};
 }finally{bytes?.dispose();native?.dispose();if(!transferred){selected?.dispose();uploads?.dispose();}}
}
