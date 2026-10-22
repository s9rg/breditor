/** Strict new API contract only; never execute these compile-time examples. */
import {RichAssetStore,RichAssetStoreCustody,type RichAssetHeldRestoreOptions} from '@breditor/experimental-rich-content';
const options:RichAssetHeldRestoreOptions={uploadState:'preserve',checkAuthority(){},limits:{maxStoredBytes:1024}};
const result=await RichAssetStore.restoreBackupHeld('selected-assets',new Blob(),options);
const store:RichAssetStore=result.store,custody:RichAssetStoreCustody=result.custody;
custody.check();await custody.close();store.close();
// @ts-expect-error host current authority is mandatory
await RichAssetStore.restoreBackupHeld('selected-assets',new Blob(),{uploadState:'preserve'});
// @ts-expect-error upload state is retained, not reset by the restore
await RichAssetStore.restoreBackupHeld('selected-assets',new Blob(),{uploadState:'reset',checkAuthority(){}});
// @ts-expect-error no public flag may bypass actual custody
await RichAssetStore.restoreBackupHeld('selected-assets',new Blob(),{uploadState:'preserve',checkAuthority(){},bypassCustody:true});
// @ts-expect-error result ownership pair is readonly
result.store=store;
// @ts-expect-error a lookalike is not the nominal actual custody owner
const fake:typeof result={store,custody:{check(){},release(){},async close(){}}};
void fake;
