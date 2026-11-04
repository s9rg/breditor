/** Hash detached canonical snapshots into a compact expected-DATA record.
 * This action performs no storage, network, actor transfer or readiness grant. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {captureMetadataContinuationPinArchive} from './capture_archive.js';
import type {MetadataContinuationEvidencePins} from './contract.js';
export async function captureMetadataContinuationPins(provided:unknown,options:SharedArchiveIntegrityOptions):Promise<MetadataContinuationEvidencePins>{
 return (await captureMetadataContinuationPinArchive(provided,options)).pins;
}
