/** Exact current canonical snapshot lengths/digests must match the selected
 * observation. This DATA comparison by itself supplies no live permission. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {metadataContinuationEvidencePins} from './identity.js';
import {captureMetadataContinuationPins} from './capture.js';
import {metadataPinsFailure as fail} from './policy.js';
import type {MetadataContinuationEvidencePins} from './contract.js';
export async function compareMetadataContinuationPins(expected:unknown,actual:unknown,options:SharedArchiveIntegrityOptions):Promise<MetadataContinuationEvidencePins>{
 const selected=metadataContinuationEvidencePins(expected),observed=await captureMetadataContinuationPins(actual,options);
 if(JSON.stringify(selected)!==JSON.stringify(observed))throw fail('metadata_pins_stale');return observed;
}
