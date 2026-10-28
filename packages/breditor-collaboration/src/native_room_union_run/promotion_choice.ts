/** Independently pinned joint handoff DATA. Neither a journal head nor an
 * approval archive can manufacture a real root, actor cohort or successor. */
import {approvalChoice} from '../physical_room_asset_approval/choice.js';
import {unionRunIdentity,MAX_UNION_RUN_EVENTS} from './identity.js';
import {fields,integer,hash,immutable,fail} from './policy.js';
import type {NativeRoomUnionRunPromotionChoice} from './contract.js';
export function unionRunPromotionChoice(value:unknown):NativeRoomUnionRunPromotionChoice {
 const r=fields(value,['format','formatVersion','identity','head','approval']),h=fields(r['head'],['sequence','sha256']);
 if(r['format']!=='breditor/native-room-union-run-promotion-choice'||r['formatVersion']!==1)throw fail('room_union_run_policy');
 const identity=unionRunIdentity(r['identity']),approval=approvalChoice(r['approval']),layout=identity.execution.plan.layout;
 if(approval.adoption.source.operationDatabase!==layout.operationDatabase||approval.adoption.source.catalogDatabase!==layout.catalogDatabase||JSON.stringify(approval.adoption.source.catalog)!==JSON.stringify(identity.execution.plan.catalog)||approval.adoption.database!==layout.adoptionDatabase||approval.adoption.participants.length!==layout.participants.length)throw fail('room_union_run_policy');
 for(const row of approval.adoption.participants){const target=layout.participants.find(member=>member.id===row.id),base=identity.execution.plan.assets.find(member=>member.id===row.id);if(!target||!base||row.targetDatabase!==target.selectedUploadsDatabase||row.base.bytes!==base.adoptionBase.bytes||row.base.sha256!==base.adoptionBase.sha256)throw fail('room_union_run_policy');}
 return immutable({format:'breditor/native-room-union-run-promotion-choice',formatVersion:1,identity,head:{sequence:integer(h['sequence'],MAX_UNION_RUN_EVENTS-1),sha256:hash(h['sha256'])},approval});
}
