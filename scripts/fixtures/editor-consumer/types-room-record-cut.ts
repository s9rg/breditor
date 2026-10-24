import {PhysicalRoomRecordCutArchive,readRetainedPhysicalRoomRecordCut,type PhysicalRoomRecordCutSelection,type SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/index.js';
import {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const root:PhysicalRoomClientOperationV3,options:PhysicalOperationV3HistoryReadOptions<'document-v1'>,integrity:SharedArchiveIntegrityOptions,pin:PhysicalRoomRecordCutSelection;
const saved=await root.captureRecordCut(options),retained=await root.retainRecordCut('independent-immutable-cut',options),file:Blob=saved.file;
const archive=await PhysicalRoomRecordCutArchive.read(file,pin,integrity),cold=await readRetainedPhysicalRoomRecordCut('independent-immutable-cut',retained.selection,integrity);
archive.metadata().participants[0]?.family;cold.inputs('original')[0]?.role;const records:unknown=await archive.records('original');void records;
// @ts-expect-error A data archive has no editing/activation permission.
archive.intoParts();
// @ts-expect-error No approval is inferred from a stored phase or exact hash.
cold.activate();
// @ts-expect-error The independently retained exact pin is required for cold reads.
await readRetainedPhysicalRoomRecordCut('independent-immutable-cut',integrity);
// @ts-expect-error Metadata is immutable and is not a mutable source owner.
archive.metadata().participants.push({id:'writer',family:'original',inputFiles:1});
// @ts-expect-error Full record DTOs never masquerade as a native source.
records.core.redo();
archive.dispose();cold.dispose();
