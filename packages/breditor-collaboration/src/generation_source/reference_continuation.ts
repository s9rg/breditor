/** Exact native ancestry with local versions, predecessor and relay receipts. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedGenerationSourceIdentity} from './contract.js';
import type {SharedGenerationRecovery} from './validate_records.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import {samePredecessor} from './continued_records.js';

interface SelectedGenerationReplay {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;
 readonly source:{readonly versions:readonly string[]};
 readonly recovery:SharedGenerationRecovery;
 check():void;
}
const exact=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
const compatible=SharedRichEditor.prototype.verifyRetainedNativeBranch;
export function verifyGenerationReferenceContinuation(
 identity:SharedGenerationSourceIdentity,before:SelectedGenerationReplay,after:SelectedGenerationReplay,
 fail:()=>Error,mode:'exact'|'compatible'='exact',
):void{
 before.check();
 after.check();
 (mode==='exact'?exact:compatible).call(after.core,before.core);
 if(before.source.versions.some((packet,index)=>after.source.versions[index]!==packet))throw fail();
 if(before.recovery.format==='breditor/shared-continued-history-backup'){
  if(after.recovery.format!==before.recovery.format||
     !samePredecessor(before.recovery.predecessor,after.recovery.predecessor))throw fail();
 }else if(identity.kind==='relay'||identity.kind==='retained'){
  forwardProgress((before.recovery as SharedSegmentedRelayRecovery).relay,(after.recovery as SharedSegmentedRelayRecovery).relay);
 }
 before.check();
 after.check();
}
