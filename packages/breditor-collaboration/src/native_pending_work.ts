/** Existing constructor-owned native persistence work only. This does not save,
 * retry, flush, replay, open storage or grant custody. A failed save remains in
 * the actual session for the subsequent complete-record read to retain. */
import {SharedEditorError} from './core.js';
const pending=new WeakMap<object,()=>Promise<unknown>|undefined>();
const registered=new WeakSet<object>();
const fail=()=>new SharedEditorError('native_pending_work','Wait on the actual constructor-owned persistence queue');
/** Trusted native-session constructor only, never incoming data admission. */
export function registerNativePendingWork(core:object,current:()=>Promise<unknown>|undefined):()=>void{
 if(registered.has(core))throw fail();registered.add(core);pending.set(core,current);let held:(()=>Promise<unknown>|undefined)|undefined=current;
 // A disposed core alias must not retain its closed session through this
 // ephemeron value. Registration stays affine; release never revives a core.
 return()=>{if(!held)return;if(pending.get(core)===held)pending.delete(core);held=undefined;};
}
export interface NativePendingWaitScope{check():void;watch(cancel:()=>void):()=>void}
/** Cancel only the read wait, not the actual source write. Both late settlement
 * handlers stay attached; cancellation never transfers or abandons that work. */
export async function waitNativePendingWork(core:object,scope:NativePendingWaitScope):Promise<void>{
 const read=pending.get(core);if(!read)throw fail();
 while(true){scope.check();const work=read();if(!work)break;
  await new Promise<void>((resolve,reject)=>{let settled=false,unwatch=()=>{};
   // Failure is a separate bit: JavaScript permits throwing undefined.
   // A failed current/watch check must never be confused with save settlement.
   const finish=(failed:boolean,error?:unknown)=>{if(settled)return;settled=true;unwatch();if(failed){reject(error);return;}try{scope.check();resolve();}catch(error){reject(error);}};
   try{unwatch=scope.watch(()=>{try{scope.check();finish(true,fail());}catch(error){finish(true,error);}});if(settled)unwatch();scope.check();
    // Attach even if cancellation won synchronously while installing a watch.
    void Promise.resolve(work).then(()=>finish(false),()=>finish(false));
   }catch(error){finish(true,error);void Promise.resolve(work).catch(()=>{});}
  });
 }
 scope.check();
}
