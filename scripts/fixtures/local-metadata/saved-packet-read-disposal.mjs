/** Actual raw Native restore may finish after cancellation. Its ownership must
 * be released exactly once without yielding a callback or reopening storage. */
import assert from 'node:assert/strict';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {visitRetainedPacketNative} from '../../../packages/breditor-collaboration/dist/metadata_packet_replay/visit.js';
export async function checkSavedReadDisposal({bundle,profile,options,sources}){
 const selected=sources.find(row=>row.id==='generation');assert.ok(selected);
 for(const mode of ['input-close','signal-abort']){
  const source=await Loaded.read(bundle.packets.references.parent.parent.current,options),signal=new AbortController();let release,entered,rawReady,visits=0,timer;
  const blocked=new Promise(resolve=>{release=resolve;}),called=new Promise(resolve=>{entered=resolve;}),rawResult=new Promise(resolve=>{rawReady=resolve;});
  const read={...selected.read,restoreSegmented:async checkpoint=>{entered();await blocked;const raw=profile.restore_segmented('room',checkpoint);rawReady(raw);return raw;}},pending=visitRetainedPacketNative(source,{...selected,read,assets:{signal:signal.signal}},async()=>{visits++;});void pending.catch(()=>{});
  try{
   await Promise.race([called,pending.then(()=>{throw Error('Delayed factory did not enter');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Delayed Native factory entry budget')),10000);})]);clearTimeout(timer);
   if(mode==='input-close')source.dispose();else signal.abort();await assert.rejects(pending);assert.equal(visits,0);release();const raw=await rawResult;await new Promise(resolve=>setImmediate(resolve));assert.throws(()=>raw.document_json(),'Late unclaimed real Native owner must be freed');
   if(mode==='signal-abort'){source.check();await visitRetainedPacketNative(source,selected,async alias=>{alias.check();assert.equal(alias.core.view().readOnly,true);});}
  }finally{clearTimeout(timer);release();source.dispose();await pending.catch(()=>{});}
 }
 return {inputCloseRefused:true,signalAbortRefused:true,lateRawOwnersFreed:true,inspectionCallbackNotInvoked:true};
}
