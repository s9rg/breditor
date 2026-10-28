import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {SharedServerLogGenerationRecoveryHost} from '@breditor/collaboration';
import {SharedPhysicalRoomRecoveryHost} from '@breditor/collaboration';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {ServerGenerationOperationHistoryAssetsRead} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/generation_history_assets_contract.js';
declare const root:PhysicalRoomClientOperationV3,host:SharedServerLogGenerationRecoveryHost,physical:SharedPhysicalRoomRecoveryHost,options:PhysicalOperationV3HistoryReadOptions<'document-v1'>;
const report:ServerGenerationOperationHistoryAssetsRead=await root.readGenerationHistoryAssets(host,options);report.control.source.origin;report.provider?.assets[0]?.bytes;
// @ts-expect-error This family has no fictitious physical ancestor.
report.control.source.ancestor;
// @ts-expect-error Declared whole upload entries are immutable data.
report.uploads[0]!.entries.push(report.uploads[0]!.entries[0]!);
// @ts-expect-error Detached reports do not carry authenticated host authority.
await root.readGenerationHistoryAssets(report,options);
// @ts-expect-error The existing physical API keeps its own native source family.
await root.readHistoryAssets(host,options);
// @ts-expect-error Physical controls cannot masquerade as generation controls.
await root.readGenerationHistoryAssets(physical,options);
// @ts-expect-error Provider availability is not registered stream coverage.
report.registeredStreamsCovered;
// @ts-expect-error There is no activation capability in this read.
report.activate();
