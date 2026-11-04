/** Re-admit the actual destination journals under their original target and
 * leases. A compact expectation never substitutes for any live source check. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkHeldOriginalMetadataJournals} from '../selected_local_metadata_continuation/original_journals.js';
import {withHeldMetadataContinuationEvidence} from '../selected_local_metadata_continuation/held_evidence.js';
import {metadataContinuationEvidencePins} from './identity.js';
import {compareMetadataContinuationPins} from './compare.js';
import {metadataPinsFailure as fail} from './policy.js';
import type {HeldMetadataContinuationPins} from './contract.js';
export async function withHeldMetadataContinuationPins<T>(scope:SelectedNativeRecoveryScope,original:Parameters<typeof withHeldMetadataContinuationEvidence>[1],provided:unknown,visit:(held:HeldMetadataContinuationPins)=>Promise<T>):Promise<T>{
 checkHeldOriginalMetadataJournals(scope,original);
 const selected=metadataContinuationEvidencePins(provided);if(typeof visit!=='function')throw fail();
 return withHeldMetadataContinuationEvidence(scope,original,selected.choice,async held=>{
  const current=await scope.retainCurrent();held.check();
  const pins=await compareMetadataContinuationPins(selected,held.evidence,{wasm:current.integrity.wasm,checkAuthority:held.check,signal:scope.signal});held.check();
  let active=true;const check=()=>{if(!active)throw fail('metadata_pins_closed');held.check();};
  try{const result=await visit(Object.freeze({pins,check}));check();return result;}finally{active=false;}
 });
}
