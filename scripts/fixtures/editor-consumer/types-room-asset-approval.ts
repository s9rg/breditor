import {RoomAssetApprovalArchive,readRetainedRoomAssetApproval,type RoomAssetApprovalOptions,type RoomAssetApprovalSelection} from '../../../packages/breditor-collaboration/dist/index.js';
import type {PhysicalRoomAssetAdoption} from '../../../packages/breditor-collaboration/dist/physical_room_asset_adoption/coordinator.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';
declare const job:PhysicalRoomAssetAdoption,reads:PhysicalOperationV3HistoryReadOptions<'document-v1'>,integrity:SharedArchiveIntegrityOptions;
const choice=await job.approvalChoice(reads),options:RoomAssetApprovalOptions<'document-v1'>={...reads,expected:choice,approve:async selected=>selected.cut.sha256===choice.cut.sha256},saved=await job.retainApprovedSelection('new-independent-evidence',options),pin:RoomAssetApprovalSelection=saved.selection;
const archive:RoomAssetApprovalArchive=await readRetainedRoomAssetApproval('new-independent-evidence',pin,integrity);
archive.choice().adoption.participants[0]?.native.document.sha256;archive.baseFile('chosen');archive.recordCut().file;archive.dispose();
// @ts-expect-error A stored ready row is not an independent full-cut choice.
job.retainApprovedSelection('evidence',{...reads,expected:{phase:'ready'},approve:()=>true});
// @ts-expect-error A fresh host decision is mandatory, even for immutable retry.
job.retainApprovedSelection('evidence',{...reads,expected:choice});
// @ts-expect-error Complete data is not an incoming native source owner.
job.intoParts(archive);
// @ts-expect-error Approval grants no authenticated server activation.
archive.activate();
// @ts-expect-error A retained base file is not a mutable upload store.
archive.baseFile('chosen').flush();
// @ts-expect-error Independent choices are deeply immutable.
choice.adoption.participants[0].selected.sha256='changed';
// @ts-expect-error The distinct approval pin is not an old record-cut pin.
const wrong:typeof choice.cut=pin;
// @ts-expect-error Booleans must be explicit; a persisted marker is not a hook.
const noHook:RoomAssetApprovalOptions={...reads,expected:choice,approve:true};
