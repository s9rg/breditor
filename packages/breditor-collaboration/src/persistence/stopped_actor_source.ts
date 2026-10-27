/** Local actor custody only. The caller must independently admit complete
 * recovery bytes, source namespaces and current permission before target use.
 * This guard never retires a live editor and never treats read-only as stopped. */
import {checkManagedCore}from'../managed_custody.js';
import {SharedEditorError}from'../core.js';
import type {ActorLeaseEscrow}from'./actor_lease_escrow.js';
import type {SharedWriterLeaseEscrow}from'./writer_lease.js';
export interface StoppedActorBinding{readonly room:string;readonly writer:string;readonly actor:string|null}
/** Match the complete room preparation bound; never truncate or chunk a single
 * atomic cohort handoff into independently committed actor groups. */
export const MAX_NATIVE_ACTOR_COHORT_MEMBERS=1024;
export type StoppedActorCustody=ActorLeaseEscrow|SharedWriterLeaseEscrow;
/** Pure readiness only; never treats read-only mode as stopped or retires a core. */
export function requireLiveActorCore(core:object):void{checkManagedCore(core);}
export function requireStoppedActorCore(core:object):void{try{checkManagedCore(core);}catch(error){const code=error instanceof SharedEditorError?error.code:undefined;if(code==='retired'||code==='disposed')return;throw error;}throw new SharedEditorError('actor_source_live','Retire every actual old native writer before moving actor custody');}
