/** Await an inert, independently retained activation choice. Cancellation may
 * end this DATA-only hook wait; both late outcomes remain observed. No source,
 * actor, native requester, store or other owned resource is passed to the hook.
 * Never use this wait to detach HTTP, transactions or resource borrowers. */
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
export async function retainActivationChoice<T>(choice:T,retain:(choice:T)=>void|Promise<void>,check:()=>void,signals:readonly(AbortSignal|undefined)[]):Promise<void>{
 const waits=new NativeReconstructionWaits(check,signals);
 try{await waits.call(()=>retain(choice));waits.check();}finally{waits.close();}
}
