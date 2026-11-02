import {participantAuthority} from '../participant_backup/policy.js';
/** Fresh seven-family history plus exact whole-upload read custody. Every real
 * parent is reserved synchronously; legacy upload locks precede read grants.
 * Newer families keep their existing custody. No ownership is transferred. */
import {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedEditorError} from '../core.js';
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {reserveCompleteHistoryWithUploads,type CompleteHistoryParticipant} from './history_read.js';
import {holdOperationalAssets,checkOperationalAssetStores,type OperationalAssetCustody} from '../operation_cohort/assets.js';
import {retainedNativeReadBorrow,type RetainedNativeWitness} from './retained_native_read.js';
import {recordLiveBasis} from './record_live_basis.js';
import {sameNativeRetentionValue,type NativeRetentionWitness} from '../operation_read/native_retention.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {prepareFinalNativeCut} from './final_native_cut.js';
import {sourceCoreMethods} from '../source_native_read.js';
const capture=RichAssetStore.prototype.captureBackup,fail=()=>new SharedEditorError('complete_history_uploads_policy','Hold genuine whole-upload and protected-history readers until verification and cleanup finish');
export function reserveCompleteHistoryUploads<P extends SharedSelectionPolicy>(input:readonly CompleteHistoryParticipant<P>[],authority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode,inherited?:OperationalAssetCustody){
 const grant=participantAuthority(authority);let assets:OperationalAssetCustody|undefined,loanedAssets:OperationalAssetCustody|undefined,loaned=false,finalRetained=false,prepared=false,working=false,closing=false,closed=false,cleanup:Promise<void>|undefined;
 // Parent permission must remain fenced by this wrapper's actual upload custody
 // even when the physical coordinator supplies its root-only parent grant.
 const parentCurrent=()=>{if(closing||closed)throw fail();(assets??loanedAssets)?.check();};
 const held=reserveCompleteHistoryWithUploads(input,()=>{parentCurrent();grant();parentCurrent();},signal,mode),read=held.read;
 const current=()=>{parentCurrent();read.checkCurrent();},work=async<T>(run:()=>Promise<T>):Promise<T>=>{if(working||closing||closed)throw fail();working=true;try{return await run();}finally{working=false;}};
 const close=():Promise<void>=>{if(closed)return Promise.resolve();if(cleanup)return cleanup;if(working)return Promise.reject(fail());closing=true;cleanup=(async()=>{if(!inherited)await assets?.close();read.close();closed=true;})().finally(()=>{cleanup=undefined;});return cleanup;};
 return Object.freeze({metadata:()=>read.metadata(),checkCurrent:current,check:()=>{current();read.check();current();},
  prepare:()=>work(async()=>{if(prepared||assets)throw fail();const stores=held.legacyUploads();if(inherited){checkOperationalAssetStores(inherited,stores);assets=inherited;}else assets=await holdOperationalAssets(stores);current();await read.prepare();prepared=true;current();}),
  verify:()=>work(async()=>{if(!prepared)throw fail();current();await read.verify();current();}),
  recordPayloads:()=>{if(!prepared||working)throw fail();current();const result=held.records();current();return result;},
  /** SDK-only donation from these SAME fully verified fresh source readers.
   * No old job guard is invoked and closing the temporary read does not drop
   * its donated genuine legacy origin-store exclusion. */
  retainNative:()=>{if(inherited||!mode||!prepared||working||loaned||!assets)throw fail();current();const sources=held.native(),witnesses:RetainedNativeWitness[]=[];let complete=false;
   try{const records=new Map(held.records().map(row=>[row.id,row]));for(const row of sources){const record=records.get(row.id);if(!record||record.family!==row.family)throw fail();const value=recordLiveBasis(row.family,record.payload.state),core=row.source.core,stamp=coreReadStamp(core),readOnly=sourceCoreMethods.view.call(core).readOnly;let retained:NativeRetentionWitness|undefined,disposed=false;
     const check=()=>{if(disposed)throw fail();const actual=coreReadStamp(core);if(actual.document!==stamp.document||actual.review!==stamp.review||sourceCoreMethods.view.call(core).readOnly!==readOnly)throw fail();
      if(!closed){current();return;}
      // Ordinary source/record access correctly refuses while its temporary
      // full-record reader owns a read gate. After that REAL cleanup, admit an
      // independent witness only by exact equality to this held LIVE cut. The
      // genuine parent, core and donated origin stores never change owners.
      if(!retained){const next=row.source.capture();try{if(!sameNativeRetentionValue(next.value,value))throw fail();retained=next;}finally{if(retained!==next)next.dispose();}}retained.check();
     };
     witnesses.push({basis:{id:row.id,family:row.family,value},check,dispose(){if(disposed)return;retained?.dispose();retained=undefined;disposed=true;}});
    }current();const borrow=retainedNativeReadBorrow(sources.map(row=>({id:row.id,family:row.family,core:row.source.core})),witnesses,assets,()=>closed,sources);borrow.check();loanedAssets=assets;assets=undefined;loaned=true;complete=true;return borrow;}
   finally{if(!complete)for(const witness of [...witnesses].reverse())witness.dispose();}
  },
  /** Separate final-cut retention keeps inherited actual origins with their root.
   * Only complete fresh source readers can create it; no custody is donated. */
  retainFinalNative:()=>{if(!inherited||!mode||!prepared||working||closing||closed||finalRetained||!assets)throw fail();current();const witness=prepareFinalNativeCut(held.native(),held.records(),current,()=>closed,()=>inherited.check());finalRetained=true;return witness;},
  captureUploads:(maximumBytes:number)=>work(async()=>{if(!prepared||!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>512*1024*1024)throw fail();current();let bytes=0;const result=[];
   for(const row of held.uploads()){const actual=await capture.call(row.store,()=>{current();return undefined;},signal?{signal}:{});current();bytes+=actual.backup.size;if(bytes>maximumBytes)throw fail();result.push(Object.freeze({id:row.id,family:row.family,file:actual.backup}));}current();return Object.freeze(result);
  }),close,
 });
}
