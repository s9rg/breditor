/** Fresh seven-family history plus exact whole-upload read custody. Every real
 * parent is reserved synchronously; legacy upload locks precede read grants.
 * Newer families keep their existing custody. No ownership is transferred. */
import {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedEditorError} from '../core.js';
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {reserveCompleteHistoryWithUploads,type CompleteHistoryParticipant} from './history_read.js';
import {holdOperationalAssets,type OperationalAssetCustody} from '../operation_cohort/assets.js';
const capture=RichAssetStore.prototype.captureBackup,fail=()=>new SharedEditorError('complete_history_uploads_policy','Hold genuine whole-upload and protected-history readers until verification and cleanup finish');
export function reserveCompleteHistoryUploads<P extends SharedSelectionPolicy>(input:readonly CompleteHistoryParticipant<P>[],authority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode){
 const held=reserveCompleteHistoryWithUploads(input,authority,signal,mode),read=held.read;let assets:OperationalAssetCustody|undefined,prepared=false,working=false,closing=false,closed=false,cleanup:Promise<void>|undefined;
 const current=()=>{if(closing||closed)throw fail();assets?.check();read.checkCurrent();},work=async<T>(run:()=>Promise<T>):Promise<T>=>{if(working||closing||closed)throw fail();working=true;try{return await run();}finally{working=false;}};
 const close=():Promise<void>=>{if(closed)return Promise.resolve();if(cleanup)return cleanup;if(working)return Promise.reject(fail());closing=true;cleanup=(async()=>{await assets?.close();read.close();closed=true;})().finally(()=>{cleanup=undefined;});return cleanup;};
 return Object.freeze({metadata:()=>read.metadata(),checkCurrent:current,check:()=>{current();read.check();current();},
  prepare:()=>work(async()=>{if(prepared||assets)throw fail();assets=await holdOperationalAssets(held.legacyUploads());current();await read.prepare();prepared=true;current();}),
  verify:()=>work(async()=>{if(!prepared)throw fail();current();await read.verify();current();}),
  recordPayloads:()=>{if(!prepared||working)throw fail();current();const result=held.records();current();return result;},
  captureUploads:(maximumBytes:number)=>work(async()=>{if(!prepared||!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>512*1024*1024)throw fail();current();let bytes=0;const result=[];
   for(const row of held.uploads()){const actual=await capture.call(row.store,()=>{current();return undefined;},signal?{signal}:{});current();bytes+=actual.backup.size;if(bytes>maximumBytes)throw fail();result.push(Object.freeze({id:row.id,family:row.family,file:actual.backup}));}current();return Object.freeze(result);
  }),close,
 });
}
