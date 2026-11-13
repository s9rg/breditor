import {SharedEditorError} from '../core.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedContinuedPairRecovery} from './contract.js';

/** The disk cut is the actual readback, which can precede the attempted write
 * or equal it after a lost acknowledgement. Both in-memory slots remain exact. */
export interface ContinuedPairRecords {
 readonly format:'breditor/persistent-continued-pair-record-read';
 readonly formatVersion:1;
 readonly scope:'atomic-continued-pair-committed-attempt-pending-live';
 readonly committed:Readonly<{head:string;recovery:SharedContinuedPairRecovery}>;
 readonly attempt:Readonly<{capture:SharedContinuedPairRecovery;cut:IndependentHistoryCut|null}>|null;
 readonly pending:SharedContinuedPairRecovery|null;
 readonly live:SharedContinuedPairRecovery;
}

interface ReadState {check():void;verify():Promise<void>;release():void}
const construction=Symbol();
export const continuedPairReadFailure=(suffix:string)=>new SharedEditorError(
 'continued_pair_read_'+suffix,'Read the actual continued pair under one unchanged storage and native observation',
);
let create:(metadata:ContinuedPairRecords,state:ReadState)=>ContinuedPairRecordRead;

/** Detached exact recovery data with a separate observation of its real source. */
export class ContinuedPairRecordRead {
 readonly #metadata:ContinuedPairRecords;
 #state:ReadState|undefined;
 #checking=false;
 #verifying=false;

 private constructor(token:symbol,metadata:ContinuedPairRecords,state:ReadState){
  if(token!==construction)throw continuedPairReadFailure('source');
  this.#metadata=frozen(structuredClone(metadata));
  this.#state=state;
  Object.freeze(this);
 }
 metadata():ContinuedPairRecords{return this.#metadata;}
 check():void{
  const state=this.#state;
  if(!state)throw continuedPairReadFailure('closed');
  if(this.#checking)throw continuedPairReadFailure('busy');
  this.#checking=true;
  try{state.check();if(this.#state!==state)throw continuedPairReadFailure('closed');}
  finally{this.#checking=false;}
 }
 async verify():Promise<void>{
  const state=this.#state;
  if(!state)throw continuedPairReadFailure('closed');
  if(this.#verifying)throw continuedPairReadFailure('busy');
  this.#verifying=true;
  try{this.check();await state.verify();this.check();}
  finally{this.#verifying=false;}
 }
 dispose():void{
  const state=this.#state;
  this.#state=undefined;
  state?.release();
 }
 static{create=(metadata,state)=>new ContinuedPairRecordRead(construction,metadata,state);}
}

/** Only the owning continued pair supplies the observation callbacks. */
export const createContinuedPairRecordRead=(metadata:ContinuedPairRecords,state:ReadState)=>create(metadata,state);
