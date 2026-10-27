/** Local actor custody only. The caller must independently admit complete
 * recovery bytes, source namespaces and current permission before target use.
 * This guard never retires a live editor and never treats read-only as stopped. */
import {checkManagedCore}from'../managed_custody.js';
import {SharedEditorError}from'../core.js';
import type {ActorLeaseEscrow}from'./actor_lease_escrow.js';
import type {SharedWriterLeaseEscrow}from'./writer_lease.js';
export interface StoppedActorBinding{readonly room:string;readonly writer:string;readonly actor:string|null}
export type StoppedActorCustody=ActorLeaseEscrow|SharedWriterLeaseEscrow;
export function requireStoppedActorCore(core:object):void{try{checkManagedCore(core);}catch(error){const code=error instanceof SharedEditorError?error.code:undefined;if(code==='retired'||code==='disposed')return;throw error;}throw new SharedEditorError('actor_source_live','Retire every actual old native writer before moving actor custody');}
