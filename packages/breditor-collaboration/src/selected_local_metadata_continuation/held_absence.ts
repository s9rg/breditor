/** Preserve an unstarted destination set without inventing a retired control.
 * All four namespaces remain reserved and leased throughout the finite visit. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {executionNames} from '../native_room_execution/plan.js';
import {checkHeldOriginalMetadataJournals,withOriginalMetadataJournals} from './original_journals.js';
import type {MetadataContinuationDestinations} from './contract.js';
import type {MetadataContinuationAbsence} from './evidence_contract.js';
import {fail} from './policy.js';
export async function withHeldAbsentMetadataContinuation<T>(scope:SelectedNativeRecoveryScope,original:Parameters<Parameters<typeof withOriginalMetadataJournals>[3]>[0],provided:MetadataContinuationDestinations,visit:(evidence:MetadataContinuationAbsence,check:()=>void)=>Promise<T>):Promise<T>{
 checkHeldOriginalMetadataJournals(scope,original);
 const r=fields(provided,['database','preparationDatabase','reviewDatabase','metadataDatabase']),destinations=Object.freeze({database:database(r['database']),preparationDatabase:database(r['preparationDatabase']),reviewDatabase:database(r['reviewDatabase']),metadataDatabase:database(r['metadataDatabase'])}),names=Object.values(destinations);
 const execution=original.execution,occupied=[...original.occupied,original.choice.database,original.choice.parent.database,original.bundle.parent.prepared.choice.database,execution.database,...executionNames(execution.execution.plan.layout),execution.execution.plan.preparation.plan.database,...execution.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
 if(typeof visit!=='function'||new Set(names).size!==4||names.some(name=>occupied.includes(name)))throw fail();
 const factory=recoveryOpeningContext(),locks=navigator.locks,leases:RecoveryLease[]=[];let active=true,opening:RecoveryOpeningCustody|undefined,cleanup:Promise<void>|undefined,primary:unknown,failed=false;
 const check=()=>{if(!active||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('metadata_continuation_closed');checkHeldOriginalMetadataJournals(scope,original);checkRecoveryLeasesHeld(leases);};
 const close=()=>{if(cleanup)return cleanup;cleanup=Promise.resolve().then(async()=>{const errors:unknown[]=[];for(const lease of [...leases].reverse())try{await lease.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Absent metadata lease cleanup did not drain');}).finally(()=>{cleanup=undefined;});return cleanup;};
 try{
  opening=await RecoveryOpeningCustody.reserve(factory,names,close,{policy:()=>fail(),busy:()=>fail('metadata_continuation_busy'),storage:()=>fail('metadata_continuation_storage')});check();
  for(const name of [...names].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));check();}
  for(const name of names)if(await physicalOperationV3Present(name,check))throw fail('metadata_continuation_exists');
  const evidence:MetadataContinuationAbsence=Object.freeze({format:'breditor/metadata-continuation-absence',formatVersion:1,destinations});
  check();const result=await visit(evidence,check);check();for(const name of names)if(await physicalOperationV3Present(name,check))throw fail('metadata_continuation_exists');check();return result;
 }catch(error){primary=error;failed=true;throw error;}finally{active=false;const errors:unknown[]=[];for(const stop of[close,()=>opening?.rollback()])try{await stop();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(failed?[primary,...errors]:errors,'Absent metadata destination cleanup did not drain');}
}
