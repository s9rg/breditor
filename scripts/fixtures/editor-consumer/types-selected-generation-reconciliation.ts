import {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {SharedServerLogGenerationRecoveryHost,SharedPhysicalRoomRecoveryHost} from '@breditor/collaboration';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {SelectedGenerationReconciliationRead} from '../../../packages/breditor-collaboration/dist/selected_room_reconciliation/generation_contract.js';
declare const owner:RetainedSelectedAssetOwner,host:SharedServerLogGenerationRecoveryHost,physical:SharedPhysicalRoomRecoveryHost,options:PhysicalOperationV3HistoryReadOptions<'document-v1'>;
const report:SelectedGenerationReconciliationRead=await owner.readGenerationReconciliation(host,options);report.native.documentAuthors;report.heads[0]?.relation;report.provider.control.source.origin;
// @ts-expect-error The real generation origin is not a physical ancestor alias.
report.provider.control.source.ancestor;
// @ts-expect-error Physical controls retain their distinct authenticated family.
await owner.readGenerationReconciliation(physical,options);
// @ts-expect-error The original physical route never accepts generation controls.
await owner.readReconciliation(host,options);
// @ts-expect-error A report cannot supply a genuine native host.
await owner.readGenerationReconciliation(report,options);
// @ts-expect-error Immutable requirement rows cannot be acknowledged by a consumer.
report.heads[0]!.localThrough='0';
// @ts-expect-error Prefix agreement is not serving authority or queue acknowledgement.
report.activate();

import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
declare const scope:SelectedNativeRecoveryScope;
const held:SelectedGenerationReconciliationRead=await scope.readGenerationReconciliation(host);void held;
// @ts-expect-error Neither private scope nor report can replace a branded host.
await scope.readGenerationReconciliation(report);
