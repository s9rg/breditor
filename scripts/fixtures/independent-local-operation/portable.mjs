/** Genuine complete local ownership with distinct CURRENT/PENDING/LIVE states.
 * No fabricated phase, delivery identity, source rows or readiness is supplied. */
import assert from 'node:assert/strict';
import {insertCleanupText} from '../owned-core-cleanup/session.mjs';
import {recoveryFaults} from '../independent-delivery-recovery/storage.mjs';
import {secondAsset} from '../review-assets/pixels.mjs';
export const portableBytes=async blob=>Buffer.from(await blob.arrayBuffer());
export async function prepareLocalPortableCase(f,capture,{stage='all',abortWriter=true}={}){
 const faults=recoveryFaults(),writeAbort=new AbortController(),backups=[];let readAllowed=true;
 try{
  const parts=await f.take(await f.begin(await f.recover(),'begin',{recovery:{...f.options.recovery,signal:writeAbort.signal}})),source=parts.source.session;
  if(stage!=='initial'){
   insertCleanupText(source.core,'Portable CURRENT ');const thread=source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Portable current review'}}).event;await source.flush();await source.retainVersion(source.core.captureVersion('Portable current version','alice','19'));
   if(stage==='all'){
    faults.select(f.options.sourceDatabase,'local_operation_history_heads',1,'abort');insertCleanupText(source.core,'Portable PENDING ');await assert.rejects(source.flush());faults.clear();insertCleanupText(source.core,'Portable offline LIVE ');source.core.dispatchReview({kind:'reply',data:{thread,body:'Portable unsaved review'}});await parts.uploads.retry(secondAsset);
   }
  }
  const live=source.exportRecovery(),uploads=await portableBytes(await parts.uploads.exportBackup()),readOptions={session:f.options.recovery.session,checkAuthority(){if(!readAllowed)throw Error('Fresh portable read grant ended');}};
  if(abortWriter){f.setAllowed(false);writeAbort.abort();assert.throws(()=>source.save());if(stage==='all')await assert.rejects(source.flush());}
  return{f,parts,source,live,uploads,readOptions,writeAbort,setReadAllowed(value){readAllowed=value;},async capture(overrides={}){const result=await capture({source,assets:parts.uploads,...readOptions,...overrides});if(result.kind==='ready')backups.push(result.backup);return result;},async close(){readAllowed=true;f.setAllowed(true);for(const backup of backups.toReversed())backup.dispose();await f.close();}};
 }catch(error){readAllowed=true;f.setAllowed(true);for(const backup of backups.toReversed())backup.dispose();await f.close();throw error;}
 finally{faults.clear();faults.restore();}
}
