/** SDK-only projection of a genuine same-cut native witness. Unlike prefix
 * coverage, exact head agreement never treats preserved offline suffixes as
 * accepted. This neither inspects nor settles packet delivery receipts. */
import type {SelectedNativeCutRead} from './contract.js';
import type {SelectedGenerationHeadRequirement} from './generation_contract.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
export const MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS=100000;
export function selectedGenerationHeadRequirements(native:Pick<SelectedNativeCutRead,'participants'|'documentAuthors'|'reviewAuthors'>):readonly SelectedGenerationHeadRequirement[]{
 const result:SelectedGenerationHeadRequirement[]=[];
 for(const row of native.participants){
  for(const lane of ['document','review'] as const){const heads=lane==='document'?row.documentHeads:row.review.heads,authors=lane==='document'?native.documentAuthors:native.reviewAuthors;
   if(lane==='review'&&row.review.kind!=='bound')continue;
   if(heads.length!==authors.length)throw new SharedRoomParticipantInventoryError('inventory_source','Actual native heads do not align with accepted authors');
   for(const[index,head]of heads.entries()){const accepted=authors[index]!.acceptedThrough;if(head===accepted)continue;
    if(result.length>=MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS)throw new SharedRoomParticipantInventoryError('inventory_budget','Complete generation native head requirements exceed the selected report budget');
    result.push({participant:row.id,lane,authorIndex:index,relation:BigInt(head)<BigInt(accepted)?'server-ahead':'local-ahead',localThrough:head,acceptedThrough:accepted});
   }
  }
 }
 return result;
}
