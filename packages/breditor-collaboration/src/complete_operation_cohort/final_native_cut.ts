/** SDK-only final LIVE/native/packet witness from the same complete held cut.
 * Unlike native-origin donation, this never takes/releases inherited upload
 * custody or transfers a parent. Stored DATA cannot supply these sources. */
import {SharedEditorError} from '../core.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {sameNativeRetentionValue,type NativeRetentionSource,type NativeRetentionWitness} from '../operation_read/native_retention.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {PhysicalRoomRecordCutParticipant} from '../physical_room_record_cut/contract.js';
import {recordLiveBasis} from './record_live_basis.js';
export interface FinalNativeCutWitness{check():void;dispose():void}
const fail=()=>new SharedEditorError('native_retirement_cut_changed','The actual complete native and packet cut must remain unchanged through final retirement');
/** Call only from the complete-reader coordinator with actual private sources.
 * Independent witnesses are admitted AFTER real temporary-read cleanup, by
 * equality to that reader's complete LIVE values, not selected counters. */
export function prepareFinalNativeCut(sources:readonly Readonly<{id:string;family:RecordPayloadFamily;source:NativeRetentionSource}>[],records:readonly PhysicalRoomRecordCutParticipant[],current:()=>void,readClosed:()=>boolean,checkAssets:()=>void):FinalNativeCutWitness{
 current();const rows=new Map(records.map(row=>[row.id,row]));if(rows.size!==records.length||sources.length!==records.length)throw fail();
 let entries=sources.map(row=>{const record=rows.get(row.id);if(!record||record.family!==row.family)throw fail();const core=row.source.core;return{source:row.source,core,stamp:coreReadStamp(core),readOnly:sourceCoreMethods.view.call(core).readOnly,value:recordLiveBasis(row.family,record.payload.state),witness:undefined as NativeRetentionWitness|undefined};}),retiring=false,disposed=false;
 const check=()=>{if(retiring||disposed)throw fail();checkAssets();if(!readClosed()){current();return;}
  for(const entry of entries){const stamp=coreReadStamp(entry.core);if(stamp.document!==entry.stamp.document||stamp.review!==entry.stamp.review||sourceCoreMethods.view.call(entry.core).readOnly!==entry.readOnly)throw fail();
   if(!entry.witness){const next=entry.source.capture();try{if(!sameNativeRetentionValue(next.value,entry.value))throw fail();entry.witness=next;}finally{if(entry.witness!==next)next.dispose();}}entry.witness.check();
  }
  // Admission of a later member cannot invalidate an already checked sibling.
  // These are actual private lifecycle/epoch reads, never host author grants.
  for(const entry of entries)entry.witness!.check();checkAssets();
 };
 const dispose=()=>{if(disposed)return;retiring=true;const failures:unknown[]=[];for(const entry of [...entries].reverse())if(entry.witness)try{entry.witness.dispose();entry.witness=undefined;}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Final native-cut witness cleanup remains pending');entries=[];disposed=true;};
 current();return Object.freeze({check,dispose});
}
