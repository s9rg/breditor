/** Non-consuming inspection of the five delivery/local families. This is
 * intentionally separate from cohort.ts: its preparation cannot retire input,
 * release parent namespaces, or construct a source/upload transfer handoff. */
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {reserveIndependentDeliveryRead} from '../independent_operation/participant.js';
import {reserveRestoredOperationRead} from '../restored_participant/participant.js';
import {reserveIndependentLocalRead} from '../independent_local_operation/participant.js';
import {reserveRestoredLocalRead} from '../restored_local_operation/participant.js';
import {reserveFlatLocalRead} from '../flat_local_operation/participant.js';
import type {DeliveryOperationParticipant} from './cohort.js';
import type {OperationalReadReservation} from '../operation_read/reservation.js';

type State<F extends string,R>=Readonly<{id:string;family:F;parts:R}>;
export type DeliveryOperationReadMember<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |State<'independent-delivery',ReturnType<typeof reserveIndependentDeliveryRead<P>>['states'][number]>
 |State<'restored-graph',ReturnType<typeof reserveRestoredOperationRead<P>>['states'][number]>
 |State<'independent-local',ReturnType<typeof reserveIndependentLocalRead<P>>['states'][number]>
 |State<'local-operation-snapshot',ReturnType<typeof reserveRestoredLocalRead<P>>['states'][number]>
 |State<'local-operation-flat',ReturnType<typeof reserveFlatLocalRead<P>>['states'][number]>;
const freeze=Object.freeze,fail=()=>new SharedEditorError('delivery_operation_read_policy','Use distinct IDs and genuine inactive operational parents for a non-consuming read');

export function reserveDeliveryOperationRead<P extends SharedSelectionPolicy>(provided:readonly DeliveryOperationParticipant<P>[]):OperationalReadReservation<DeliveryOperationReadMember<P>>{
 const input=snapshotInventoryInputs(provided,fail,value=>{const row=archiveFields(value,'id,family,operation'),id=physicalCatalogName(row['id']);if(!['independent-delivery','restored-graph','independent-local','local-operation-snapshot','local-operation-flat'].includes(row['family'] as string))throw fail();return{id,family:row['family'],operation:row['operation']} as DeliveryOperationParticipant<P>;});
 if(!input.length||new Set(input.map(row=>row.id)).size!==input.length)throw fail();
 const scopes:OperationalReadReservation<unknown>[]=[],pending=new Set<OperationalReadReservation<unknown>>();
 let prepared=false,working=false,closing=false,closed=false,values:readonly DeliveryOperationReadMember<P>[]=[];
 const current=()=>{if(!prepared||closed||closing)throw fail();for(const scope of scopes)scope.checkCurrent();};
 const work=async(run:()=>Promise<void>)=>{if(working||closed||closing)throw fail();working=true;try{await run();}finally{working=false;}};
 const close=()=>{if(closed)return;if(working)throw fail();closing=true;let error:unknown;for(const scope of [...pending].reverse())try{scope.close();pending.delete(scope);}catch(cause){error??=cause;}if(pending.size)throw error??fail();closed=true;};
 try{
  // Reserve every genuine owner before the first verification/policy callback.
  for(const row of input){
   const scope=row.family==='independent-delivery'?reserveIndependentDeliveryRead([row.operation]):row.family==='restored-graph'?reserveRestoredOperationRead([row.operation]):row.family==='independent-local'?reserveIndependentLocalRead([row.operation]):row.family==='local-operation-snapshot'?reserveRestoredLocalRead(row.operation):reserveFlatLocalRead(row.operation);
   scopes.push(scope);pending.add(scope);
  }
  return freeze({get states(){current();return values;},
   prepare:()=>work(async()=>{if(prepared)throw fail();for(const scope of scopes)await scope.prepare();values=freeze(input.map((row,index)=>freeze({id:row.id,family:row.family,parts:scopes[index]!.states[0]}) as DeliveryOperationReadMember<P>));prepared=true;current();}),
   verify:()=>work(async()=>{current();for(const scope of scopes)await scope.verify();current();}),
   checkCurrent:current,close,
  });
 }catch(error){close();throw error;}
}
