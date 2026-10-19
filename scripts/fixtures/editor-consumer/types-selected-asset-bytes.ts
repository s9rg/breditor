/** Installed public types: metadata is not live provenance, bytes are not provider grants. */
import {captureSharedAssetBytes,exportSharedAssetBytesBackup,readSharedAssetBytesBackup,SharedAssetBytesCapture,SharedAssetBytesArchive,encodeSharedRetainedStoreBackup,type SharedAssetReferenceCapture,type SharedAssetBytesResolver,type SharedAssetBytesMetadata,type SharedRetainedStoreBackupSource} from "@breditor/collaboration";
import {inspectRichRaster,type RichRasterInspection} from "@breditor/editor";
declare const source:SharedAssetReferenceCapture,blob:Blob,resolver:SharedAssetBytesResolver,metadata:SharedAssetBytesMetadata,recordJson:string,policy:SharedRetainedStoreBackupSource;
async function contracts(){
 const raster:RichRasterInspection=await inspectRichRaster(blob);const bytes:Blob=raster.blob;void bytes;
 const outcome=await captureSharedAssetBytes({source,resolveAsset:resolver,signal:new AbortController().signal});
 if(outcome.kind==="pending"){
  // @ts-expect-error An incomplete result has no usable prefix capture.
  outcome.capture;
 }else{outcome.capture.check();const file:Blob=await exportSharedAssetBytesBackup(outcome.capture);const archive=await readSharedAssetBytesBackup(file);archive.verifySource(source);const url:string|undefined=archive.resolve("opaque-id","generation");void url;archive.dispose();outcome.capture.dispose();}
 await encodeSharedRetainedStoreBackup(policy,recordJson);
 // @ts-expect-error Detached metadata carries no native owner/source proof.
 captureSharedAssetBytes({source:metadata,resolveAsset:resolver});
 // @ts-expect-error URL strings are not captured, admitted raster bytes.
 readSharedAssetBytesBackup("https://example.invalid/image.png");
 // @ts-expect-error Asset capture constructors are private.
 new SharedAssetBytesCapture();
 // @ts-expect-error Transport readers cannot be directly forged.
 new SharedAssetBytesArchive();
 // @ts-expect-error Metadata is immutable.
 metadata.bindings.push({asset:"a",generation:"g",identity:"host-verified",contentAsset:"hash"});
 // @ts-expect-error Captured records require an explicit host identity policy.
 encodeSharedRetainedStoreBackup({kind:"suggestions"},recordJson);
 const archive=await readSharedAssetBytesBackup(blob);
 // @ts-expect-error Generations remain exact strings, never numeric coercion.
 archive.blob("asset",1);
}
// @ts-expect-error The resolver must explicitly bind immutable bytes and a synchronous guard.
const wrongResolver:SharedAssetBytesResolver=async reference=>({...reference,identity:"assumed",blob,check(){}});
void contracts;void wrongResolver;
