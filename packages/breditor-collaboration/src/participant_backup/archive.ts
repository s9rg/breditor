import {RichAssetStore} from "@breditor/experimental-rich-content";
import type {RichAssetArchiveEntry} from "@breditor/experimental-rich-content";
import type {SharedAssetReferenceCapture,SharedAssetCaptureRecord} from "../asset_references_capture.js";
import {encodeSharedSessionBackup} from "../backups/session.js";
import {encodeSharedPairedSessionBackup,readPairedBackupRecord} from "../backups/paired.js";
import {encodeSharedRetainedStoreBackup} from "../backups/retained_store.js";
import type {SharedRetainedStoreBackupSource} from "../backups/retained_store_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import {captureParticipant} from "./capture.js";
import {readParticipant} from "./read.js";
import {participantDigest} from "./format.js";
import {participantSignal,SharedParticipantBackupError} from "./policy.js";
import type {SharedParticipantBackupCaptureOptions,SharedParticipantBackupSelection,SharedParticipantBackupOptions,SharedParticipantBackupPending} from "./types.js";
import type {ParticipantState} from "./state.js";
const key=Object.freeze({}),states=new WeakMap<SharedParticipantBackup,ParticipantState>(),captureAssets=RichAssetStore.prototype.captureBackup;
const closed=()=>new SharedParticipantBackupError("participant_closed","The participant backup is disposed or was not admitted by this SDK");
export type SharedParticipantBackupOutcome=Readonly<{kind:"ready";backup:SharedParticipantBackup}>|Readonly<{kind:"pending";pending:SharedParticipantBackupPending}>;
/** Coherent selected native/packet cut plus every upload record in the explicitly supplied store.
 * Immutable files and selection carry no current account/provider or cross-device writer grant. */
export class SharedParticipantBackup {
 readonly #selection:SharedParticipantBackupSelection;
 private constructor(token:object,state:ParticipantState){if(token!==key)throw closed();this.#selection=state.selection;states.set(this,state);Object.freeze(this);}
 selection():SharedParticipantBackupSelection{return this.#selection;}
 file():Blob{const state=states.get(this);if(!state)throw closed();return state.file;}
 records():readonly SharedAssetCaptureRecord[]{const state=states.get(this);if(!state)throw closed();return state.selected.records();}
 uploadEntries():readonly RichAssetArchiveEntry[]{const state=states.get(this);if(!state)throw closed();return state.uploads.entries();}
 blob(asset:string,generation:string):Blob|undefined{const state=states.get(this);if(!state)throw closed();return state.selected.blob(asset,generation);}
 uploadBlob(asset:string):Blob|undefined{const state=states.get(this);if(!state)throw closed();return state.uploads.blob(asset);}
 /** Original complete upload-state file for explicit existing empty-destination restoration. */
 uploadBackup():Blob{const state=states.get(this);if(!state)throw closed();return state.uploads.backup();}
 /** Existing native/paired factories remain independently host-selected; a file cannot pick one. */
 async documentBackup():Promise<string>{const state=states.get(this);if(!state)throw closed();const row=state.selected.records()[0]!;return encodeSharedSessionBackup(state.selection.identity.source,row.json);}
 async pairedBackup():Promise<string>{const state=states.get(this);if(!state)throw closed();const row=state.selected.records().find(r=>r.kind==="paired-session");if(!row)throw new SharedParticipantBackupError("participant_policy","This explicit participant has no paired source");return encodeSharedPairedSessionBackup(state.selection.identity.source,readPairedBackupRecord(row.json,state.selection.identity.source));}
 /** Exact old envelope; dependent identities and ownership/binding policy remain explicit inputs. */
 async retainedBackup(source:SharedRetainedStoreBackupSource,options:Pick<SharedParticipantBackupOptions,"signal">={}):Promise<string>{const state=states.get(this);if(!state)throw closed();const row=state.selected.records().find(r=>r.kind===source.kind);if(!row)throw new SharedParticipantBackupError("participant_policy","The selected participant does not include this retained store");return encodeSharedRetainedStoreBackup(source,row.json,options);}
 verifySource(source:SharedAssetReferenceCapture):void{const state=states.get(this);if(!state)throw closed();state.selected.verifySource(source);}
 /** Verify actual re-admitted source owners and exact recovered uploads at a common live cut.
  * This saves no source, issues no receipt, starts no network and is not an activation token. */
 async verifyRecovered(source:SharedAssetReferenceCapture,uploads:RichAssetStore,options:Pick<SharedParticipantBackupOptions,"signal">={}):Promise<void>{
  const state=states.get(this);if(!state)throw closed();const {signal}={...options};participantSignal(signal);state.selected.verifySource(source);
  const cut=await captureAssets.call(uploads,()=>{state.selected.verifySource(source);return undefined;},signal?{signal}:{});
  if(states.get(this)!==state)throw closed();state.selected.verifySource(source);
  if(await participantDigest(cut.backup,signal)!==state.header.uploads.sha256)throw new SharedParticipantBackupError("participant_integrity","Recovered upload state differs from the selected participant cut");
  if(states.get(this)!==state)throw closed();state.selected.verifySource(source);participantSignal(signal);
 }
 dispose():void{const state=states.get(this);if(!state)return;states.delete(this);state.selected.dispose();state.uploads.dispose();}
 static async capture<P extends SharedSelectionPolicy>(options:SharedParticipantBackupCaptureOptions<P>):Promise<SharedParticipantBackupOutcome>{const result=await captureParticipant(options);return result.kind==="pending"?Object.freeze(result):Object.freeze({kind:"ready",backup:new SharedParticipantBackup(key,result.state)});}
 static async read(file:Blob,expected:SharedParticipantBackupSelection,options:SharedParticipantBackupOptions={}):Promise<SharedParticipantBackup>{return new SharedParticipantBackup(key,await readParticipant(file,expected,options));}
}
export const captureSharedParticipantBackup=<P extends SharedSelectionPolicy>(options:SharedParticipantBackupCaptureOptions<P>):Promise<SharedParticipantBackupOutcome>=>SharedParticipantBackup.capture(options);
export const readSharedParticipantBackup=(file:Blob,expected:SharedParticipantBackupSelection,options:SharedParticipantBackupOptions={}):Promise<SharedParticipantBackup>=>SharedParticipantBackup.read(file,expected,options);
