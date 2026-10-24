import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {SharedPhysicalRoomRecoveryHost} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const root:PhysicalRoomClientOperationV3,host:SharedPhysicalRoomRecoveryHost,options:PhysicalOperationV3HistoryReadOptions<'document-v1'>;
const report=await root.readHistoryAssets(host,options);report.provider?.assets[0]?.bytes;report.uploads[0]?.sha256;
// @ts-expect-error Whole-upload diagnostics are immutable and not a mutable store.
report.uploads[0]!.entries.push(report.uploads[0]!.entries[0]!);
// @ts-expect-error Detached entries do not carry a whole-store write capability.
report.uploads[0]!.store.retry('asset');
// @ts-expect-error A saved report is not the branded authenticated checker.
await root.readHistoryAssets(report,options);
// @ts-expect-error Address and byte availability is not registered-stream coverage.
report.registeredStreamsCovered;
// @ts-expect-error A point-in-time check cannot activate the room.
report.activate();
