/** Test-only pause at one actual native restore. Cleanup may precede entry:
 * a released gate must also release a factory that arrives later. */
import assert from'node:assert/strict';
import{setImmediate as turn}from'node:timers/promises';
import{freeUnclaimedSharedRustOwner}from'../../../packages/breditor-collaboration/dist/raw_owner_lifetime.js';
import{nativeRestoreBinding}from'../../../packages/breditor-collaboration/dist/native_restore_factory.js';
export async function within(promise,label,timeoutMs=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native read did not finish before late host release: '+label)),timeoutMs);})]);}finally{clearTimeout(timer);}}
export function pauseNativeRead(reads,id,at=1){
 const row=reads.find(row=>row.id===id);assert.ok(row);const read=row.read,history=read.session?.documentHistory,receiver=history??read,name=history?(history.kind==='original'?'restoreOriginal':'restoreSegmented'):typeof read.restore==='function'?'restore':'restoreSegmented',binding=nativeRestoreBinding(receiver[name],receiver);assert.equal(typeof binding.factory,'function');
 let startedResolve,resolve,reject,raw,args,calls=0,freed=0,released=false,producing;const started=new Promise(accept=>{startedResolve=accept;}),delayed=new Promise((accept,refuse)=>{resolve=accept;reject=refuse;});
 const produce=()=>{if(!producing){producing=Promise.resolve().then(()=>Reflect.apply(binding.factory,binding.receiver,args)).then(value=>{raw=value;const free=raw.free.bind(raw);raw.free=()=>{freed++;return free();};resolve(raw);},error=>{reject(error);throw error;});void producing.catch(()=>{});}return producing;};
 const restore=function(...values){calls++;if(calls!==at)return Reflect.apply(binding.factory,binding.receiver,values);args=values;startedResolve();if(released)void produce();return delayed;},selected=history?{...read,session:{...read.session,documentHistory:{...history,[name]:restore}}}:{...read,[name]:restore};
 return{reads:reads.map(value=>value.id===id?{...value,read:selected}:value),started,get calls(){return calls;},get freed(){return freed;},async releaseLate(){released=true;if(args)await produce();await turn();},assertFreed(){const actual=freed;if(raw&&actual===0)freeUnclaimedSharedRustOwner(raw);assert.equal(actual,args?1:0);}};
}
export function countNativeReads(reads,id){
 const row=reads.find(row=>row.id===id),read=row.read,history=read.session?.documentHistory,receiver=history??read,name=history?(history.kind==='original'?'restoreOriginal':'restoreSegmented'):typeof read.restore==='function'?'restore':'restoreSegmented',binding=nativeRestoreBinding(receiver[name],receiver);let calls=0;const restore=function(...args){calls++;return Reflect.apply(binding.factory,binding.receiver,args);},selected=history?{...read,session:{...read.session,documentHistory:{...history,[name]:restore}}}:{...read,[name]:restore};
 return{reads:reads.map(value=>value.id===id?{...value,read:selected}:value),get calls(){return calls;}};
}
