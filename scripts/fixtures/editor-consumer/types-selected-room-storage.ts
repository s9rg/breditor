import {captureSelectedRoomStorage} from '../../../packages/breditor-collaboration/dist/selected_room_storage/capture.js';
import {SelectedRoomStorageArchive} from '../../../packages/breditor-collaboration/dist/selected_room_storage/archive.js';import {previewSelectedRoomStorageRestore,restoreSelectedRoomStorageData} from '../../../packages/breditor-collaboration/dist/selected_room_storage/restore.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';import type {StorageFile} from '../../../packages/breditor-collaboration/dist/selected_room_storage/contract.js';
declare const scope:SelectedNativeRecoveryScope,options:SharedArchiveIntegrityOptions;
async function complete(){const file:StorageFile=await captureSelectedRoomStorage(scope,{localReview:null,checkAuthority:options.checkAuthority}),archive=await SelectedRoomStorageArchive.read(file.file,file.selection,options),expected=await previewSelectedRoomStorageRestore(archive,options),data=await restoreSelectedRoomStorageData(archive,{...options,expected,approve:()=>true});
 // @ts-expect-error Restored DATA is not an editable/native delivery owner.
 data.createDelivery();
 // @ts-expect-error Fresh approval is not optional.
 await restoreSelectedRoomStorageData(archive,{...options,expected});
 archive.dispose();
}
// @ts-expect-error Caller-supplied database lists cannot select capture namespaces.
captureSelectedRoomStorage(scope,{localReview:null,checkAuthority(){},databases:['unrelated']});
void complete;
