/** Closed intrinsic journal registry. No plugin/options/file can register a
 * family, replace its parsers or manufacture its identity. Adding another wire
 * family requires an explicit implementation here and its own closed facade. */
import {SharedEditorError} from '../core.js';
import type {NativeInputJournalChoice,NativeInputCutIntent,NativeInputJournalIntrinsics} from './journal_contract.js';
import type {RestoredLocalOperationJournal} from '../restored_local_operation/journal.js';
import {createRestoredLocalJournalFacade,restoredLocalJournalBinding,restoredLocalJournalAccess} from '../restored_local_operation/journal.js';
import {DetachedRestoredLocalInput,restoredLocalInput as incoming} from '../restored_local_operation/input.js';
import {restoredLocalInputOptions,snapshotRestoredLocalPolicy,type RestoredLocalInputOptions} from '../restored_local_operation/policy.js';
import {readRestoredLocalHead,wrapRestoredLocalHead} from '../restored_local_operation/head.js';
import {initialRestoredLocalIntent,type RestoredLocalCutIntent} from '../restored_local_operation/intent.js';
import {createRestoredLocalJournalDatabase,existingRestoredLocalJournalDatabase,readRestoredLocalJournalInput,readRestoredLocalJournalDatabase,writeRestoredLocalJournalDatabase} from '../restored_local_operation/database.js';
import {admitRestoredLocalCuts} from '../restored_local_operation/cut_validation.js';
import {restoredLocalJournalOpening,requireRestoredLocalParticipantOpening} from '../restored_local_operation/participant_opening.js';
import {restoredLocalFailure} from '../restored_local_operation/failure.js';
import type {FlatLocalOperationJournal} from '../flat_local_operation/journal.js';
import {createFlatLocalJournalFacade,flatLocalJournalBinding,flatLocalJournalAccess} from '../flat_local_operation/journal.js';
import {DetachedFlatLocalInput,flatLocalInput as flatInput} from '../flat_local_operation/input.js';
import {snapshotFlatLocalPolicy,flatLocalInputOptions,type FlatLocalInputOptions} from '../flat_local_operation/policy.js';
import {readFlatLocalHead,wrapFlatLocalHead} from '../flat_local_operation/head.js';
import {initialFlatLocalIntent,type FlatLocalCutIntent} from '../flat_local_operation/intent.js';
import {createFlatLocalJournalDatabase,existingFlatLocalJournalDatabase,readFlatLocalJournalInput,readFlatLocalJournalDatabase,writeFlatLocalJournalDatabase} from '../flat_local_operation/database.js';
import {admitFlatLocalCuts} from '../flat_local_operation/cut_validation.js';
import {nativeInputJournalOpening} from './participant_opening.js';
import {flatLocalFailure} from '../flat_local_operation/failure.js';

export type RestoredLocalJournalChoice=ReturnType<typeof snapshotRestoredLocalPolicy>;
type SnapshotFamily=NativeInputJournalFamily<RestoredLocalInputOptions,RestoredLocalJournalChoice,DetachedRestoredLocalInput,RestoredLocalCutIntent,RestoredLocalOperationJournal>;
export type FlatLocalJournalChoice=ReturnType<typeof snapshotFlatLocalPolicy>;
type FlatFamily=NativeInputJournalFamily<FlatLocalInputOptions,FlatLocalJournalChoice,DetachedFlatLocalInput,FlatLocalCutIntent,FlatLocalOperationJournal>;
const key=Object.freeze({});
let snapshot:SnapshotFamily;
let flat:FlatFamily;
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
    file:(owner:DetachedRestoredLocalInput)=>incoming.file.call(owner),originalFile:(owner:DetachedRestoredLocalInput)=>incoming.originalFile.call(owner),uploads:(owner:DetachedRestoredLocalInput)=>incoming.uploads.call(owner),blob:(owner:DetachedRestoredLocalInput,asset:string,generation:string)=>incoming.blob.call(owner,asset,generation),cohort:(owner:DetachedRestoredLocalInput)=>incoming.cohort.call(owner),
   }),
   head:Object.freeze({read:readRestoredLocalHead,wrap:wrapRestoredLocalHead}),initial:initialRestoredLocalIntent,
   database:Object.freeze({existing:existingRestoredLocalJournalDatabase,input:readRestoredLocalJournalInput,create:createRestoredLocalJournalDatabase,read:readRestoredLocalJournalDatabase,write:writeRestoredLocalJournalDatabase}),
   admit:admitRestoredLocalCuts,
   delegate:(parent:unknown,context:IDBFactory,pair:readonly string[],names:readonly string[],cleanup:()=>Promise<void>)=>restoredLocalJournalOpening(requireRestoredLocalParticipantOpening(parent),context,pair,names,cleanup),
   journal:Object.freeze({binding:(facade:RestoredLocalOperationJournal)=>restoredLocalJournalBinding(facade),file:(facade:RestoredLocalOperationJournal)=>restoredLocalJournalAccess.file.call(facade),blob:(facade:RestoredLocalOperationJournal,asset:string,generation:string)=>restoredLocalJournalAccess.blob.call(facade,asset,generation),progress:(facade:RestoredLocalOperationJournal)=>restoredLocalJournalAccess.progress.call(facade),close:(facade:RestoredLocalOperationJournal)=>restoredLocalJournalAccess.close.call(facade)}),
   facade:createRestoredLocalJournalFacade,
  });
  flat=new NativeInputJournalFamily(key,{
   kind:'flat-local-v1',error:(suffix?:string)=>flatLocalFailure(suffix===undefined?undefined:'flat_local_input_'+suffix),snapshot:snapshotFlatLocalPolicy,
   input:Object.freeze({read:(file:Blob,choice:FlatLocalJournalChoice)=>flatInput.read.call(DetachedFlatLocalInput,file,flatLocalInputOptions(choice)),check:(owner:DetachedFlatLocalInput)=>flatInput.check.call(owner),verifyFile:(owner:DetachedFlatLocalInput,file:Blob,guard:()=>void)=>flatInput.verifyFile.call(owner,file,guard),dispose:(owner:DetachedFlatLocalInput)=>flatInput.dispose.call(owner),identity:(owner:DetachedFlatLocalInput)=>flatInput.identity.call(owner),live:(owner:DetachedFlatLocalInput)=>flatInput.live.call(owner),targets:(owner:DetachedFlatLocalInput)=>flatInput.targets.call(owner),file:(owner:DetachedFlatLocalInput)=>flatInput.file.call(owner),originalFile:(owner:DetachedFlatLocalInput)=>flatInput.originalFile.call(owner),uploads:(owner:DetachedFlatLocalInput)=>flatInput.uploads.call(owner),blob:(owner:DetachedFlatLocalInput,asset:string,generation:string)=>flatInput.blob.call(owner,asset,generation),cohort:(owner:DetachedFlatLocalInput)=>flatInput.cohort.call(owner)}),
   head:Object.freeze({read:readFlatLocalHead,wrap:wrapFlatLocalHead}),initial:initialFlatLocalIntent,
   database:Object.freeze({existing:existingFlatLocalJournalDatabase,input:readFlatLocalJournalInput,create:createFlatLocalJournalDatabase,read:readFlatLocalJournalDatabase,write:writeFlatLocalJournalDatabase}),admit:admitFlatLocalCuts,
   delegate:(parent:unknown,context:IDBFactory,pair:readonly string[],names:readonly string[],cleanup:()=>Promise<void>)=>nativeInputJournalOpening(parent,flatLocalJournalFamily,context,pair,names,cleanup),
   journal:Object.freeze({binding:(facade:FlatLocalOperationJournal)=>flatLocalJournalBinding(facade),file:(facade:FlatLocalOperationJournal)=>flatLocalJournalAccess.file.call(facade),blob:(facade:FlatLocalOperationJournal,asset:string,generation:string)=>flatLocalJournalAccess.blob.call(facade,asset,generation),progress:(facade:FlatLocalOperationJournal)=>flatLocalJournalAccess.progress.call(facade),close:(facade:FlatLocalOperationJournal)=>flatLocalJournalAccess.close.call(facade)}),facade:createFlatLocalJournalFacade,
  });
 }
}
/** Only this fixed singleton selects the existing snapshot wire semantics. */
export const restoredLocalJournalFamily:SnapshotFamily=snapshot;
/** Explicit new format. Its presence never widens the snapshot facade. */
export const flatLocalJournalFamily:FlatFamily=flat;
/** Read actual private slots; serialized data and prototype-only fakes refuse. */
export function nativeInputJournalFamily<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>){return readFamily(family);}
