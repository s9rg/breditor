/** Closed canonical independent pins. Staged readiness is necessary, never
 * sufficient: a matching fresh host decision remains a separate operation. */
import {adoptionRecord} from '../physical_room_asset_adoption/record.js';
import {recordCutSelection} from '../physical_room_record_cut/archive.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,fail,hash} from '../physical_room_asset_adoption/policy.js';
import type {RoomAssetApprovalChoice,RoomAssetApprovalSelection} from './contract.js';
export const MAX_ROOM_ASSET_APPROVAL_BYTES=1024*1024*1024;
export function approvalChoice(value:unknown):RoomAssetApprovalChoice{const r=fields(value,['format','formatVersion','cut','adoption']);if(r['format']!=='breditor/room-asset-approval-choice'||r['formatVersion']!==1)throw fail('asset_adoption_policy');const cut=recordCutSelection(r['cut']),adoption=adoptionRecord(r['adoption']);if(adoption.phase!=='ready'||adoption.participants.some(row=>row.state!=='complete'||row.native.review.kind==='unselected'))throw fail('asset_adoption_diverged');return frozen({format:'breditor/room-asset-approval-choice',formatVersion:1,cut,adoption});}
export function approvalSelection(value:unknown):RoomAssetApprovalSelection{const r=fields(value,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/room-asset-approval-selection'||r['formatVersion']!==1||typeof r['bytes']!=='number'||!Number.isSafeInteger(r['bytes'])||r['bytes']<1||r['bytes']>MAX_ROOM_ASSET_APPROVAL_BYTES)throw fail('asset_adoption_policy');return frozen({format:'breditor/room-asset-approval-selection',formatVersion:1,bytes:r['bytes'],sha256:hash(r['sha256'])});}
