/** Own canonical UTF-8 bodies before any callback, validate their original
 * bindings, then hash with the explicitly selected trusted integrity runtime.
 * No storage, network, actor, acknowledgement or activation is supplied. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {metadataContinuationEvidencePins} from './identity.js';
import {prepareMetadataPinCapture} from './prepare_capture.js';
import {validateMetadataPinCapture} from './validate_capture.js';
import type {MetadataContinuationPinArchive,MetadataSnapshotPin} from './contract.js';
export async function captureMetadataContinuationPinArchive(provided:unknown,options:SharedArchiveIntegrityOptions):Promise<MetadataContinuationPinArchive>{
 const plan=prepareMetadataPinCapture(provided),integrity=prepareArchiveIntegrity(options);
 await validateMetadataPinCapture(plan);integrity.guard();
 const pin=async(file:Blob|null):Promise<MetadataSnapshotPin|null>=>file===null?null:{bytes:file.size,sha256:await integrity.digest(file)};
 const review=await pin(plan.review);integrity.guard();const metadata=await pin(plan.metadata);integrity.guard();
 const pins=metadataContinuationEvidencePins({format:'breditor/metadata-continuation-evidence-pins',formatVersion:1,choice:plan.choice,phase:plan.phase,review,metadata});
 return Object.freeze({format:'breditor/metadata-continuation-pin-archive',formatVersion:1,pins,review:plan.review,metadata:plan.metadata});
}
