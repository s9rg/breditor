/** Deterministic complete-record selection. Native order is necessary but
 * never sufficient: packets and queues must also fit the candidate. Unknown
 * errors propagate; a cancellation, grant or storage failure is not a vote. */
import type {GenerationComponentSide} from './components.js';
import {fail} from './policy.js';
export async function selectConservedComponent(
 currentIntoJournal:boolean,journalIntoCurrent:boolean,
 covers:(side:GenerationComponentSide)=>Promise<boolean>,check:()=>void,
):Promise<GenerationComponentSide> {
 check();
 if(typeof currentIntoJournal!=='boolean'||typeof journalIntoCurrent!=='boolean'||typeof covers!=='function')throw fail('generation_component_reconstruction_policy');
 if(currentIntoJournal){const accepted=await covers('journal');check();if(accepted===true)return 'journal';if(accepted!==false)throw fail('generation_component_reconstruction_policy');}
 if(journalIntoCurrent){const accepted=await covers('current');check();if(accepted===true)return 'current';if(accepted!==false)throw fail('generation_component_reconstruction_policy');}
 throw fail('generation_component_reconstruction_requires_merge');
}
export function nativeOrderMismatch(error:unknown):boolean {
 return error==='contract violation: shared recovery origin lineage differs'||error instanceof Error&&'code'in error&&error.code==='recovery_origin';
}
export function packetOrderMismatch(error:unknown):boolean {
 return error instanceof Error&&'code'in error&&error.code==='native_reconstruction_requires_merge';
}
export function uploadOrderMismatch(error:unknown):boolean {
 return error instanceof Error&&'code'in error&&error.code==='asset_adoption_diverged';
}
