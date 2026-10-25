/** A combined cut is immutable data, not an active room, owner or credential. */
import * as api from '@breditor/collaboration';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {SelectedRoomReconciliationRead} from '../../../packages/breditor-collaboration/dist/selected_room_reconciliation/contract.js';
import type {SharedPhysicalRoomRecoveryHost} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const owner:RetainedSelectedAssetOwner,host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions,report:SelectedRoomReconciliationRead;
const result:Promise<SelectedRoomReconciliationRead>=owner.readReconciliation(host,input);void result;
// @ts-expect-error Detached diagnostics are not a genuine independently selected host.
owner.readReconciliation(report,input);
// @ts-expect-error The report owns no native clients.
report.clients;
// @ts-expect-error It cannot activate or acknowledge the server.
report.activate();
// @ts-expect-error Global counter vectors are immutable.
report.native.participants[0]!.documentHeads.push('0');
// @ts-expect-error Accepted author definitions are immutable too.
report.native.documentAuthors[0]!.acceptedThrough='0';
// @ts-expect-error The SDK-private reader is not a public-root export.
api.captureSelectedNativeCut;
