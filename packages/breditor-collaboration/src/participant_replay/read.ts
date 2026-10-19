/** Private read-only native replay of a retained client copy. No DB, author lease or delivery. */
import {prepareRecovery,type PreparedRecovery} from "../participant_recovery/prepare.js";
import {ParticipantOrigin} from "../participant_operation/origin.js";
import type {SharedParticipantRecoveryOptions} from "../participant_recovery/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedParticipantBackupSelection} from "../participant_backup/types.js";
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {SharedParticipantReplayError,participantReplayFailure} from "./errors.js";
const key=Object.freeze({});
/** A genuine replay keeps both native journals private and exposes read-only source capabilities.
 * The backup/host guard are borrowed and must remain live; disposal never closes that backup.
 * Original recovery options are reused for explicit policies; destinations/ports are not opened.
 * This does not merge histories, authenticate server registrations or grant activation. */
export class SharedParticipantReplay{
 readonly #origin:ParticipantOrigin;readonly #source:SharedAssetReferenceCapture;readonly #selection:Readonly<SharedParticipantBackupSelection>;
 #closed=false;
 private constructor(token:object,origin:ParticipantOrigin,source:SharedAssetReferenceCapture,selection:Readonly<SharedParticipantBackupSelection>){if(token!==key)throw new SharedParticipantReplayError("participant_replay_closed");this.#origin=origin;this.#source=source;this.#selection=selection;Object.freeze(this);}
 /** The independent original source selection is detached metadata, never an activation proof. */
 selection():Readonly<SharedParticipantBackupSelection>{return this.#selection;}
 check():void{try{if(this.#closed)throw Error();this.#source.check();}catch(error){throw participantReplayFailure(error,"participant_replay_closed");}}
 /** Actual native causal history and every declared original packet source, not saved references. */
 references():SharedAssetReferenceCapture{this.check();return this.#source;}
 /** Pure same-writer document and paired-review journal continuity, including old history inputs.
  * An unrelated/forked/shorter current owner refuses without importing or discarding either copy. */
 verifyCurrent<P extends SharedSelectionPolicy>(current:SharedRichEditor<P>):void{
  this.check();try{this.#origin.verify(current as unknown as SharedRichEditor<SharedSelectionPolicy>);if(this.#closed)throw new SharedParticipantReplayError("participant_replay_closed");this.#source.records();}catch{this.check();throw new SharedParticipantReplayError("participant_replay_continuity");}
 }
 /** Drop only this private native reader; no source, upload, receipt or writer ownership changes. */
 dispose():void{if(this.#closed)return;this.#closed=true;this.#source.dispose();this.#origin.dispose();}
 static async read<P extends SharedSelectionPolicy>(options:SharedParticipantRecoveryOptions<P>):Promise<SharedParticipantReplay>{
  let prepared:PreparedRecovery<P>;
  try{prepared=await prepareRecovery(options);}catch(error){throw participantReplayFailure(error,"participant_replay_policy");}
  let origin:ParticipantOrigin|undefined,source:SharedAssetReferenceCapture|undefined;
  try{
   const p=prepared as unknown as PreparedRecovery<SharedSelectionPolicy>;origin=await ParticipantOrigin.read(p);p.guard();source=origin.capture(p);SharedParticipantBackup.prototype.verifySource.call(p.backup,source);source.check();
   return new SharedParticipantReplay(key,origin,source,p.expected);
  }catch(error){source?.dispose();origin?.dispose();throw participantReplayFailure(error,"participant_replay_native");}
 }
}
