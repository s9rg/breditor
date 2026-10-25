/** Point-in-time provider data cannot act as a mutable owner or live host. */
import * as api from '@breditor/collaboration';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {SelectedRoomProviderRead} from '../../../packages/breditor-collaboration/dist/selected_room_provider/contract.js';
import type {SharedPhysicalRoomRecoveryHost} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const owner:RetainedSelectedAssetOwner,host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions,report:SelectedRoomProviderRead;
const result:Promise<SelectedRoomProviderRead>=owner.readHistoryAssets(host,input);void result;
// @ts-expect-error The saved selection/report is not a live branded operator host.
owner.readHistoryAssets(report,input);
// @ts-expect-error A detached provider report owns no editable native clients.
report.clients;
// @ts-expect-error Point-in-time availability grants no activation.
report.activate();
// @ts-expect-error It is not a server registration-closure capability.
report.registeredStreamsCovered;
// @ts-expect-error Private provider composition is not a public-root entry point.
api.selectedRoomProvider;
// @ts-expect-error A private same-native owner cannot be constructed through the package root.
api.RetainedSelectedAssetOwner;
