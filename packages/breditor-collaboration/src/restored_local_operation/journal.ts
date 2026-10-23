/** Closed snapshot-v1 journal facade over shared native-input machinery. The
 * actual input, head/intent/schema parsers and parent opening remain this exact
 * intrinsic family. Another facade or structural ready object selects nothing. */
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredLocalInputOptions} from './policy.js';
import type {DetachedRestoredLocalInput} from './input.js';
import type {RestoredLocalCutIntent} from './intent.js';
import type {RestoredLocalParticipantOpening} from './participant_opening.js';
import {restoredLocalFailure as fail} from './failure.js';
import {restoredLocalJournalFamily,type RestoredLocalJournalChoice} from '../native_input_operation/journal_families.js';
import {NativeInputJournal,nativeInputJournalMethods,nativeInputJournalBinding,assertNativeInputJournalFacadeCreation} from '../native_input_operation/journal_kernel.js';
type Kernel=NativeInputJournal<RestoredLocalInputOptions,RestoredLocalJournalChoice,DetachedRestoredLocalInput,RestoredLocalCutIntent,RestoredLocalOperationJournal>;
const key=Object.freeze({});
let create:(kernel:Kernel)=>RestoredLocalOperationJournal;
let binding:(journal:RestoredLocalOperationJournal)=>ReturnType<RestoredLocalOperationJournal['bindingType']>;
let owns:(value:unknown)=>value is RestoredLocalOperationJournal;
let openForParticipant:<P extends SharedSelectionPolicy>(parent:RestoredLocalParticipantOpening,provided:RestoredLocalInputOptions<P>,file?:Blob)=>Promise<RestoredLocalOperationJournal>;
export class RestoredLocalOperationJournal{
 readonly #kernel:Kernel;
 private constructor(token:object,kernel:Kernel){if(token!==key)throw fail('restored_local_operation_closed');assertNativeInputJournalFacadeCreation(kernel,restoredLocalJournalFamily);this.#kernel=kernel;Object.freeze(this);}
 static begin<P extends SharedSelectionPolicy>(file:Blob,options:RestoredLocalInputOptions<P>):Promise<RestoredLocalOperationJournal>{if(this!==RestoredLocalOperationJournal)throw fail();return RestoredLocalOperationJournal.#open(options,file);}
 static resume<P extends SharedSelectionPolicy>(options:RestoredLocalInputOptions<P>):Promise<RestoredLocalOperationJournal>{if(this!==RestoredLocalOperationJournal)throw fail();return RestoredLocalOperationJournal.#open(options);}
 static #open<P extends SharedSelectionPolicy>(provided:RestoredLocalInputOptions<P>,file?:Blob,parent?:RestoredLocalParticipantOpening,delegated=false):Promise<RestoredLocalOperationJournal>{return NativeInputJournal.open(restoredLocalJournalFamily,provided,file,parent,delegated);}
 progress(){return nativeInputJournalMethods.progress.call(this.#kernel);}
 file():Blob{return nativeInputJournalMethods.file.call(this.#kernel);}
 blob(asset:string,generation:string):Blob|undefined{return nativeInputJournalMethods.blob.call(this.#kernel,asset,generation);}
 close():Promise<void>{return nativeInputJournalMethods.close.call(this.#kernel);}
 private bindingType(){return nativeInputJournalBinding(this.#kernel,this);}
 static{
  create=kernel=>new RestoredLocalOperationJournal(key,kernel);
  binding=journal=>{if(!journal||typeof journal!=='object'||!(#kernel in journal))throw fail('restored_local_operation_closed');return journal.bindingType();};
  owns=(value):value is RestoredLocalOperationJournal=>!!value&&typeof value==='object'&&#kernel in value;
  openForParticipant=(parent,provided,file)=>RestoredLocalOperationJournal.#open(provided,file,parent,true);
 }
}
/** Intrinsic registry bridge. Its constructor validates the actual unattached
 * kernel and family before wrapping; exporting this never admits a fake owner. */
export function createRestoredLocalJournalFacade(kernel:Kernel):RestoredLocalOperationJournal{return create(kernel);}
export function ownsRestoredLocalJournal(value:unknown):value is RestoredLocalOperationJournal{return owns(value);}
export const restoredLocalJournalBinding=(journal:RestoredLocalOperationJournal)=>binding(journal);
/** Only this format's actual current cohort delegates its native pair. */
export const openRestoredLocalJournalForParticipant=<P extends SharedSelectionPolicy>(parent:RestoredLocalParticipantOpening,provided:RestoredLocalInputOptions<P>,file?:Blob)=>openForParticipant(parent,provided,file);
/** Deferred intrinsic registry access preserves the actual facade brand and
 * canonical methods without an eager class read in the module cycle. */
const p=RestoredLocalOperationJournal.prototype;
export const restoredLocalJournalAccess=Object.freeze({file:p.file,blob:p.blob,progress:p.progress,close:p.close});
