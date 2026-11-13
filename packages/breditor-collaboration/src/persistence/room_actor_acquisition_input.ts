/** Capture every literal identity before any authority call or lock request.
 * Real lease factories keep their existing canonical room/writer/actor rules. */
import {SharedEditorError} from '../core.js';
import {fields,rows} from '../physical_room_record_cut/policy.js';
import {MAX_NATIVE_ACTOR_COHORT_MEMBERS} from './stopped_actor_source.js';
import type {RoomActorAcquisitionOptions,RoomActorAcquisitionMember} from './room_actor_acquisition_contract.js';
export const roomActorAcquisitionFailure=(suffix='policy')=>new SharedEditorError('actor_acquisition_'+suffix,'Acquire every actual local actor into the reachable acquisition owner before using native targets');
export function roomActorAcquisitionInput(provided:RoomActorAcquisitionOptions):RoomActorAcquisitionOptions{
 try{const r=fields(provided,['room','members','checkAuthority'],['signal']),room=r['room'],authority=r['checkAuthority'];
  if(typeof room!=='string'||!room||new TextEncoder().encode(room).length>200||typeof authority!=='function')throw roomActorAcquisitionFailure();
  const ids=new Set<string>(),writers=new Set<string>(),actors=new Set<string>(),selected=rows(r['members'],MAX_NATIVE_ACTOR_COHORT_MEMBERS);if(!selected.length)throw roomActorAcquisitionFailure();
  const members=selected.map(value=>{const m=fields(value,['id','factory','writer','actor']),id=m['id'],factory=m['factory'],writer=m['writer'],actor=m['actor'];
   if(typeof id!=='string'||!id||id.length>200||typeof writer!=='string'||!/^\d+$/.test(writer)||writer.length>20||BigInt(writer)<1n||BigInt(writer)>=18446744073709551615n||BigInt(writer).toString()!==writer||typeof factory!=='string'||!['shared','review','segmented','independent','continued-delivery'].includes(factory))throw roomActorAcquisitionFailure();
   if(actor!==null&&(typeof actor!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actor))||factory==='shared'&&actor!==null||(factory==='review'||factory==='independent'||factory==='continued-delivery')&&actor===null)throw roomActorAcquisitionFailure();
   if(ids.has(id)||writers.has(writer)||actor!==null&&actors.has(actor as string))throw roomActorAcquisitionFailure('duplicate');ids.add(id);writers.add(writer);if(actor!==null)actors.add(actor as string);
   return Object.freeze({id,factory,writer,actor}) as RoomActorAcquisitionMember;
  });
  return Object.freeze({room,members:Object.freeze(members),checkAuthority:authority as ()=>void,...(r['signal']!==undefined?{signal:r['signal'] as AbortSignal}:{})});
 }catch(error){if(error instanceof SharedEditorError&&error.code.startsWith('actor_acquisition_'))throw error;throw roomActorAcquisitionFailure();}
}
