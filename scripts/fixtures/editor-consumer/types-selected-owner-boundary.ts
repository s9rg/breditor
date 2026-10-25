/** Internal functionality is not a public cold-owner/writer permission API. */
import * as api from '@breditor/collaboration';
import {resumeColdSelectedRoom} from '../../../packages/breditor-collaboration/dist/cold_selected_room/coordinator.js';
import type {ColdSelectedRoomResumeOptions} from '../../../packages/breditor-collaboration/dist/cold_selected_room/contract.js';
import {SelectedRoomCurrentArchive} from '../../../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import type {PhysicalRoomClientOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
// @ts-expect-error A package-root consumer cannot invoke the private resume coordinator.
api.resumeColdSelectedRoom;
// @ts-expect-error A preview is data, not a package-root operational grant.
api.previewColdSelectedRoom;
// @ts-expect-error Only actual retained resources can create this private owner.
api.RetainedSelectedAssetOwner;
// @ts-expect-error Native continuation is a private constructor-owned capability.
api.transferPhysicalOperationV3RetainedRoot;
declare const archive:SelectedRoomCurrentArchive,root:PhysicalRoomClientOperationV3,options:ColdSelectedRoomResumeOptions;
// @ts-expect-error A data archive has no mutable native clients.
archive.clients;
// @ts-expect-error A data archive does not grant editing or activation.
archive.resume;
// @ts-expect-error Copied root metadata lacks actual private custody.
resumeColdSelectedRoom({},archive,options);
// @ts-expect-error A structurally similar data record is not an admitted archive.
resumeColdSelectedRoom(root,{},options);
// @ts-expect-error A saved choice is not native parent custody.
resumeColdSelectedRoom(options.expected,archive,options);
