/** Read every original catalog copy with private native owners, without author leases or storage. */
import {catalogArchiveState,type CatalogArchiveState} from "../room_recovery_catalog/archive.js";
import {snapshotCatalogParticipant} from "../room_recovery_catalog/prepare_stage.js";
import {selected,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES} from "../room_recovery_catalog/policy.js";
import {participantAuthority} from "../participant_backup/policy.js";
import {SharedParticipantReplay} from "../participant_replay/read.js";
import {SharedRoomParticipantInventory} from "../room_participant_inventory/inventory.js";
import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRoomRecoveryCatalogSelection} from "../room_recovery_catalog/types.js";
import type {SharedRoomReplayOptions,SharedRoomReplayEntry} from "./contract.js";
import {SharedRoomReplayError,roomReplayFailure} from "./errors.js";
const key=Object.freeze({});
interface Life{closed:boolean}
interface Owner{readonly id:string;readonly replay:SharedParticipantReplay}
/** All supplied copies are read; none is selected, merged, connected, made obsolete or discarded.
 * The original catalog is borrowed and must stay live. This class owns only private native readers.
 * Hold current host/fence/provider authority separately before any later activation transition. */
export class SharedRoomReplay{
 readonly #owners:readonly Owner[];readonly #entries:readonly SharedRoomReplayEntry[];readonly #guard:()=>void;readonly #bare:()=>void;readonly #life:Life;readonly #selection:SharedRoomRecoveryCatalogSelection;
 private constructor(token:object,owners:readonly Owner[],entries:readonly SharedRoomReplayEntry[],guard:()=>void,bare:()=>void,life:Life,selection:SharedRoomRecoveryCatalogSelection){if(token!==key)throw new SharedRoomReplayError("room_replay_closed");this.#owners=owners;this.#entries=entries;this.#guard=guard;this.#bare=bare;this.#life=life;this.#selection=selection;Object.freeze(this);}
 selection():SharedRoomRecoveryCatalogSelection{return this.#selection;}
 #retained():void{this.#bare();for(const entry of this.#entries){SharedParticipantBackup.prototype.file.call(entry.backup);SharedAssetReferenceCapture.prototype.records.call(entry.source);}}
 check():void{try{this.#guard();for(const owner of this.#owners)owner.replay.check();this.#guard();this.#retained();}catch(error){throw roomReplayFailure(error,"room_replay_closed");}}
 /** A complete ordered borrowed source set for the exact original catalog, including duplicate writers. */
 entries():readonly SharedRoomReplayEntry[]{this.check();return this.#entries;}
 /** Native same-writer document/review journal continuation only. Packet/upload reconciliation and
  * current server/provider checks remain separate; this never clears an unreconciled copy marker. */
 verifyNativeContinuation<P extends SharedSelectionPolicy>(id:string,current:SharedRichEditor<P>):void{
  this.check();const owner=this.#owners.find(owner=>owner.id===id);if(!owner)throw new SharedRoomReplayError("room_replay_policy");
  try{owner.replay.verifyCurrent(current);this.#retained();}catch{this.check();throw new SharedRoomReplayError("room_replay_continuity");}
 }
 /** Dispose private readers only. Every original file, catalog and current author stays untouched. */
 dispose():void{if(this.#life.closed)return;this.#life.closed=true;for(const owner of [...this.#owners].reverse())owner.replay.dispose();}
 static async read(supplied:SharedRoomReplayOptions):Promise<SharedRoomReplay>{
  const owners:Owner[]=[],entries:SharedRoomReplayEntry[]=[];let source:CatalogArchiveState,guard:()=>void,bare:()=>void,expect:SharedRoomRecoveryCatalogSelection,rows:SharedRoomReplayOptions["participants"],life:Life,signal:AbortSignal|undefined;
  try{
   const input={...supplied},archive=input.archive;signal=input.signal;expect=selected(input.expected);source=catalogArchiveState(archive);
   if(JSON.stringify(source.selection)!==JSON.stringify(expect)||!Array.isArray(input.participants)||input.participants.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES-2)throw Error();
   rows=input.participants.map(snapshotCatalogParticipant).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   if(rows.length!==source.metadata.participants.length||rows.some((row,index)=>row.id!==source.metadata.participants[index]!.id))throw Error();
   let authority:()=>void;try{authority=participantAuthority(input.checkAuthority);}catch{throw new SharedRoomReplayError("room_replay_authority");}life={closed:false};bare=()=>{if(signal?.aborted)throw new SharedRoomReplayError("room_replay_aborted");if(life.closed||catalogArchiveState(archive)!==source)throw new SharedRoomReplayError("room_replay_closed");};guard=()=>{bare();try{authority();}catch{throw new SharedRoomReplayError("room_replay_authority");}bare();};guard();
  }catch(error){throw roomReplayFailure(error,"room_replay_policy");}
  try{
   for(const row of rows){guard();const backup=source.participants.get(row.id)!;
    const replay=await SharedParticipantReplay.read({...row.recovery,backup,expected:backup.selection(),checkAuthority:guard,...(signal?{signal}:{})});owners.push({id:row.id,replay});guard();
    const native=SharedRoomParticipantInventory.prototype.checkSources.call(source.inventory,[{backup,source:replay.references()}]);
    entries.push(Object.freeze({id:row.id,backup,source:replay.references(),originalInventory:native}));guard();
   }
   const value=new SharedRoomReplay(key,Object.freeze(owners.map(owner=>Object.freeze(owner))),Object.freeze(entries),guard,bare,life,expect);value.check();return value;
  }catch(error){for(const owner of owners.reverse())owner.replay.dispose();life.closed=true;throw roomReplayFailure(error,"room_replay_native");}
 }
}
