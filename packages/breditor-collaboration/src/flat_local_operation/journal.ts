/** Closed flat-local-v1 facade. A manifest file and saved phase do not issue
 * native custody; only the real shared kernel and exact family do. */
import type {SharedSelectionPolicy} from '../types.js';import type {FlatLocalInputOptions} from './policy.js';
import type {DetachedFlatLocalInput} from './input.js';import type {FlatLocalCutIntent} from './intent.js';
import type {NativeInputParticipantOpening} from '../native_input_operation/participant_opening.js';
import {flatLocalFailure as fail} from './failure.js';
import {flatLocalJournalFamily,type FlatLocalJournalChoice} from '../native_input_operation/journal_families.js';
import {NativeInputJournal,nativeInputJournalMethods,nativeInputJournalBinding,assertNativeInputJournalFacadeCreation} from '../native_input_operation/journal_kernel.js';
type Kernel=NativeInputJournal<FlatLocalInputOptions,FlatLocalJournalChoice,DetachedFlatLocalInput,FlatLocalCutIntent,FlatLocalOperationJournal>;
const key=Object.freeze({});let create:(kernel:Kernel)=>FlatLocalOperationJournal;let binding:(journal:FlatLocalOperationJournal)=>ReturnType<FlatLocalOperationJournal['bindingType']>;
let owns:(value:unknown)=>value is FlatLocalOperationJournal;
let openForParent:<P extends SharedSelectionPolicy>(parent:NativeInputParticipantOpening,options:FlatLocalInputOptions<P>,file?:Blob)=>Promise<FlatLocalOperationJournal>;
export class FlatLocalOperationJournal{
 readonly #kernel:Kernel;
 private constructor(token:object,kernel:Kernel){if(token!==key)throw fail('flat_local_input_closed');assertNativeInputJournalFacadeCreation(kernel,flatLocalJournalFamily);this.#kernel=kernel;Object.freeze(this);}
 static begin<P extends SharedSelectionPolicy>(file:Blob,options:FlatLocalInputOptions<P>):Promise<FlatLocalOperationJournal>{if(this!==FlatLocalOperationJournal)throw fail();return NativeInputJournal.open(flatLocalJournalFamily,options,file);}
 static resume<P extends SharedSelectionPolicy>(options:FlatLocalInputOptions<P>):Promise<FlatLocalOperationJournal>{if(this!==FlatLocalOperationJournal)throw fail();return NativeInputJournal.open(flatLocalJournalFamily,options);}
 progress(){return nativeInputJournalMethods.progress.call(this.#kernel);}
 file():Blob{return nativeInputJournalMethods.file.call(this.#kernel);}
 blob(asset:string,generation:string):Blob|undefined{return nativeInputJournalMethods.blob.call(this.#kernel,asset,generation);}
 close():Promise<void>{return nativeInputJournalMethods.close.call(this.#kernel);}
 private bindingType(){return nativeInputJournalBinding(this.#kernel,this);}
 static{create=kernel=>new FlatLocalOperationJournal(key,kernel);binding=journal=>{if(!journal||typeof journal!=='object'||!(#kernel in journal))throw fail('flat_local_input_closed');return journal.bindingType();};owns=(value):value is FlatLocalOperationJournal=>!!value&&typeof value==='object'&&#kernel in value;openForParent=(parent,options,file)=>NativeInputJournal.open(flatLocalJournalFamily,options,file,parent,true);}
}
export function createFlatLocalJournalFacade(kernel:Kernel):FlatLocalOperationJournal{return create(kernel);}
export function ownsFlatLocalJournal(value:unknown):value is FlatLocalOperationJournal{return owns(value);}
export const flatLocalJournalBinding=(journal:FlatLocalOperationJournal)=>binding(journal);
export const openFlatLocalJournalForParticipant=<P extends SharedSelectionPolicy>(parent:NativeInputParticipantOpening,options:FlatLocalInputOptions<P>,file?:Blob)=>openForParent(parent,options,file);
const p=FlatLocalOperationJournal.prototype;
export const flatLocalJournalAccess=Object.freeze({progress:p.progress,file:p.file,blob:p.blob,close:p.close});
