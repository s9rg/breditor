/** Exact complete per-member inputs; limits may only become tighter. */
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import type {RoomPreparationChoice} from '../native_room_preparation/contract.js';
import type {RoomExecutionReadScope} from './read_scope.js';
import {preparedNativeUploads} from './native_uploads.js';
import {tighterExecutionLimits,type ExecutionAssetInputs} from './asset_decisions.js';
import {fail} from './policy.js';
export function executionAssetInputs(context:Readonly<{before:Loaded;retained:Loaded;catalog:PhysicalRoomCatalogV3Archive}>,preparation:Readonly<{plan:Pick<RoomPreparationChoice['plan'],'participants'>}>,id:string,scope:RoomExecutionReadScope):ExecutionAssetInputs{scope.check();const before=context.before.approval().choice.adoption.participants.find(row=>row.id===id),retained=context.retained.approval().choice.adoption.participants.find(row=>row.id===id),target=preparation.plan.participants.find(row=>row.id===id)?.namespaces.find(row=>row.role==='uploads');if(!before||!retained||!target)throw fail();return{id,current:context.before.selectedUploads(id),retained:context.retained.selectedUploads(id),native:preparedNativeUploads(context.catalog,id),currentDatabase:before.targetDatabase,nativeDatabase:target.database,limits:tighterExecutionLimits(tighterExecutionLimits(before.limits,retained.limits),scope.assets?.limits)};}
