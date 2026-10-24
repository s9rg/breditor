import {PhysicalRoomAssetAdoption} from '../../../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import type {RoomAssetAdoptionBeginOptions} from '../../../packages/breditor-collaboration/dist/physical_room_asset_adoption/contract.js';
declare const root:PhysicalRoomClientOperationV3,options:RoomAssetAdoptionBeginOptions;
const captured=await PhysicalRoomAssetAdoption.capture(root,{checkAuthority(){}}),job=await PhysicalRoomAssetAdoption.begin(root,options);
const state=await job.finish();state.participants[0]?.native.document.sha256;await job.check();await job.baseFile('selected');await job.close();
// @ts-expect-error A selection report cannot manufacture a genuine root.
PhysicalRoomAssetAdoption.begin({source:captured.source},options);
// @ts-expect-error Staging returns no editable participant or upload ownership.
job.intoParts();
// @ts-expect-error Ready is not server/writer activation authority.
job.activate();
// @ts-expect-error Durable roles and current native pins are immutable evidence.
state.participants[0].targetDatabase='foreign';
// @ts-expect-error A captured whole file is not a mutable upload store.
captured.participants[0].uploads.flush();
