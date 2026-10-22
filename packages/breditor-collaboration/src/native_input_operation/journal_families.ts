/** Closed intrinsic journal registry. No plugin/options/file can register a
 * family, replace its parsers or manufacture its identity. Adding another wire
 * family requires an explicit implementation here and its own closed facade. */
import {SharedEditorError} from '../core.js';
import type {NativeInputJournalChoice,NativeInputCutIntent,NativeInputJournalIntrinsics} from './journal_contract.js';
import type {RestoredLocalOperationJournal} from '../restored_local_operation/journal.js';
import {createRestoredLocalJournalFacade} from '../restored_local_operation/journal.js';
import {DetachedRestoredLocalInput,restoredLocalInput as incoming} from '../restored_local_operation/input.js';
import {restoredLocalInputOptions,snapshotRestoredLocalPolicy,type RestoredLocalInputOptions} from '../restored_local_operation/policy.js';
import {readRestoredLocalHead,wrapRestoredLocalHead} from '../restored_local_operation/head.js';
import {initialRestoredLocalIntent,type RestoredLocalCutIntent} from '../restored_local_operation/intent.js';
import {createRestoredLocalJournalDatabase,existingRestoredLocalJournalDatabase,readRestoredLocalJournalInput,readRestoredLocalJournalDatabase,writeRestoredLocalJournalDatabase} from '../restored_local_operation/database.js';
import {admitRestoredLocalCuts} from '../restored_local_operation/cut_validation.js';
import {restoredLocalJournalOpening,requireRestoredLocalParticipantOpening} from '../restored_local_operation/participant_opening.js';
import {restoredLocalFailure} from '../restored_local_operation/failure.js';

export type RestoredLocalJournalChoice=ReturnType<typeof snapshotRestoredLocalPolicy>;
type SnapshotFamily=NativeInputJournalFamily<RestoredLocalInputOptions,RestoredLocalJournalChoice,DetachedRestoredLocalInput,RestoredLocalCutIntent,RestoredLocalOperationJournal>;
const key=Object.freeze({});
let snapshot:SnapshotFamily;
let readFamily:<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>)=>NativeInputJournalIntrinsics<A,C,O,R,F>;

export class NativeInputJournalFamily<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>{
 readonly #intrinsics:NativeInputJournalIntrinsics<A,C,O,R,F>;
 private constructor(token:object,intrinsics:NativeInputJournalIntrinsics<A,C,O,R,F>){if(token!==key)throw new SharedEditorError('native_input_operation_family','Use a closed intrinsic native-input family');this.#intrinsics=Object.freeze(intrinsics);Object.freeze(this);}
 static{
  readFamily=family=>{if(!family||typeof family!=='object'||!(#intrinsics in family))throw new SharedEditorError('native_input_operation_family','A caller descriptor or prototype is not an intrinsic family');return family.#intrinsics;};
  snapshot=new NativeInputJournalFamily(key,{
   kind:'snapshot-v1',error:(suffix?:string)=>restoredLocalFailure(suffix===undefined?undefined:'restored_local_operation_'+suffix),snapshot:snapshotRestoredLocalPolicy,
   input:Object.freeze({
    read:(file:Blob,choice:RestoredLocalJournalChoice)=>incoming.read.call(DetachedRestoredLocalInput,file,restoredLocalInputOptions(choice)),
    check:(owner:DetachedRestoredLocalInput)=>incoming.check.call(owner),verifyFile:(owner:DetachedRestoredLocalInput,file:Blob,guard:()=>void)=>incoming.verifyFile.call(owner,file,guard),dispose:(owner:DetachedRestoredLocalInput)=>incoming.dispose.call(owner),
    identity:(owner:DetachedRestoredLocalInput)=>incoming.identity.call(owner),live:(owner:DetachedRestoredLocalInput)=>incoming.live.call(owner),targets:(owner:DetachedRestoredLocalInput)=>incoming.targets.call(owner),
    file:(owner:DetachedRestoredLocalInput)=>incoming.file.call(owner),originalFile:(owner:DetachedRestoredLocalInput)=>incoming.originalFile.call(owner),uploads:(owner:DetachedRestoredLocalInput)=>incoming.uploads.call(owner),blob:(owner:DetachedRestoredLocalInput,asset:string,generation:string)=>incoming.blob.call(owner,asset,generation),
   }),
   head:Object.freeze({read:readRestoredLocalHead,wrap:wrapRestoredLocalHead}),initial:initialRestoredLocalIntent,
   database:Object.freeze({existing:existingRestoredLocalJournalDatabase,input:readRestoredLocalJournalInput,create:createRestoredLocalJournalDatabase,read:readRestoredLocalJournalDatabase,write:writeRestoredLocalJournalDatabase}),
   admit:admitRestoredLocalCuts,
   delegate:(parent:unknown,context:IDBFactory,pair:readonly string[],names:readonly string[],cleanup:()=>Promise<void>)=>restoredLocalJournalOpening(requireRestoredLocalParticipantOpening(parent),context,pair,names,cleanup),
   facade:createRestoredLocalJournalFacade,
  });
 }
}
/** Only this fixed singleton selects the existing snapshot wire semantics. */
export const restoredLocalJournalFamily:SnapshotFamily=snapshot;
/** Read actual private slots; serialized data and prototype-only fakes refuse. */
export function nativeInputJournalFamily<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>){return readFamily(family);}
