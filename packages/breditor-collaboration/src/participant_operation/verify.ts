import {readRichAssetBackup} from "@breditor/experimental-rich-content";
import {captureSharedAssetReferences} from "../asset_references_capture.js";
import {ownerSources,type RecoveryOwners} from "../participant_recovery/components.js";
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {ParticipantOrigin} from "./origin.js";
import {operationFailure} from "./errors.js";
/** Re-admit the whole current raster cut and retain all original immutable images/epochs. */
export async function verifyOperationalOwners<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,owners:RecoveryOwners<P>,origin:ParticipantOrigin):Promise<void>{
 p.guard();const core=owners.session?.core;if(!core||!owners.uploads)throw operationFailure("operation_missing");origin.verify(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
 const source=captureSharedAssetReferences(ownerSources(p,owners));let archive:Awaited<ReturnType<typeof readRichAssetBackup>>|undefined;
 try{
  const cut=await owners.uploads.captureBackup(()=>{p.guard();source.check();origin.verify(core as unknown as SharedRichEditor<SharedSelectionPolicy>);},p.signal?{signal:p.signal}:{});p.guard();source.check();
  archive=await readRichAssetBackup(cut.backup,{limits:p.limits,...(p.signal?{signal:p.signal}:{})});p.guard();source.check();const current=new Map(archive.entries().map(row=>[row.asset,row]));
  for(const before of p.backup.uploadEntries()){
   const now=current.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==="uploaded"&&(now.status!=="uploaded"||now.storageRef!==before.storageRef))throw operationFailure("operation_diverged");
  }
  p.guard();source.check();origin.verify(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
 }finally{archive?.dispose();source.dispose();}
}
