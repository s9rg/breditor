import {SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore} from '@breditor/collaboration';
import type {ContinuedPairRecords,ContinuedRoomCatalogCaptureOptions,ContinuedRoomCatalogMetadata,ContinuedRoomCatalogSelection} from '@breditor/collaboration';

declare const input:ContinuedRoomCatalogCaptureOptions;
const archive=await SharedContinuedRoomCatalog.capture(input);
const expected:ContinuedRoomCatalogSelection=archive.selection();
const options={database:'recovery-room',expected,policies:input.policies,wasm:input.wasm,checkAuthority:input.checkAuthority};
const store=await SharedContinuedRoomCatalogStore.begin({...options,archive});
const metadata:ContinuedRoomCatalogMetadata=store.metadata();
const records:ContinuedPairRecords=store.participantRecords('device');
const uploads:Blob=store.participantUploads('device');
const image:Blob|undefined=store.participantAsset('device','asset','generation');
void [metadata,records,uploads,image];
await store.close();
const reopened=await SharedContinuedRoomCatalogStore.resume(options);
await reopened.close();
archive.dispose();
