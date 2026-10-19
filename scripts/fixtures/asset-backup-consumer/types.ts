import {RichAssetStore,RichAssetBackupError,readRichAssetBackup,MAX_ASSET_BACKUP_BYTES,ASSET_BACKUP_MIME,type RichAssetBackupOptions,type RichAssetRestoreOptions} from "@breditor/editor";
import {RichAssetStore as DirectStore,type RichAssetRestoreOptions as DirectOptions} from "@breditor/experimental-rich-content";
async function contracts(store:RichAssetStore,signal:AbortSignal){
 const capture:RichAssetBackupOptions={signal},archive:Blob=await store.exportBackup(capture),options:RichAssetRestoreOptions={uploadState:"preserve",signal,limits:{maxStoredBytes:1024}},direct:DirectOptions=options;const restored=await RichAssetStore.restoreBackup("new-assets",archive,options);const sameClass:DirectStore=restored;void sameClass;void direct;void MAX_ASSET_BACKUP_BYTES;void ASSET_BACKUP_MIME;
 // @ts-expect-error Upload state preservation cannot be inferred from an archive.
 RichAssetStore.restoreBackup("implicit",archive,{});
 // @ts-expect-error Restore cannot reset cancelled uploads or accept a new server receipt.
 RichAssetStore.restoreBackup("reset",archive,{uploadState:"uploaded"});
 // @ts-expect-error The file is a binary Blob archive, not document JSON or a URL to fetch.
 RichAssetStore.restoreBackup("url","https://example.invalid/archive",options);
 const snapshot=await store.captureBackup(()=>Object.freeze({checkpoint:"native snapshot"}));const captured:string=snapshot.source.checkpoint;void captured;const read=await readRichAssetBackup(snapshot.backup);read.entries();read.dispose();
 // @ts-expect-error A callback must return before the active snapshot transaction ends.
 store.captureBackup(async()=>"late");
 try{await store.exportBackup();}catch(error){if(error instanceof RichAssetBackupError){const code:string=error.code;void code;}}
 restored.close();
}
void contracts;
import type {LocalEditor,LocalDocumentEditor,RichRetainedAssetReferencesRead,RichRetainedAssetReference,RichCoreEditor} from "@breditor/editor";
function nativeReferences(owner:LocalEditor|LocalDocumentEditor,core:RichCoreEditor){
 const supported:boolean=owner.supportsRetainedAssetReferences(),read:RichRetainedAssetReferencesRead=owner.retainedAssetReferences(owner.view().revision);owner.checkRetainedAssetReferences(read);const pair:RichRetainedAssetReference|undefined=read.references[0];void supported;void pair;
 // @ts-expect-error Detached inventories have no mutation or asset-deletion permission.
 read.references.push({asset:"forged",generation:"forged"});
 // @ts-expect-error A generation is an exact native string, not an inferred room number.
 const invalid:RichRetainedAssetReference={asset:"asset",generation:1};void invalid;
 if(core.supportsRetainedAssetReferences?.()===true&&core.retainedAssetReferences&&core.checkRetainedAssetReferences){const direct:RichRetainedAssetReferencesRead=core.retainedAssetReferences();core.checkRetainedAssetReferences(direct);}
}
void nativeReferences;
