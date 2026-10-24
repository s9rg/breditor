import {RichAssetStore,type RichAssetStoreCustody,type RichAssetReconciliationOptions} from '@breditor/experimental-rich-content';
declare const store:RichAssetStore,custody:RichAssetStoreCustody,original:Blob,options:RichAssetReconciliationOptions;
const started=await store.beginHeldReconciliation(custody,original,options),resumed=await store.resumeHeldReconciliation(custody,options);
await started.commit([]);resumed.preview().unionAssets;
// @ts-expect-error Metadata cannot provide an actual class-branded store lease.
store.beginHeldReconciliation({},original,options);
// @ts-expect-error A saved phase cannot select current custody implicitly.
store.resumeHeldReconciliation(options);
// @ts-expect-error Local reconciliation is not a room activation grant.
started.activate();
// @ts-expect-error Input file selection remains the closed current/original pair.
resumed.file('provider');
