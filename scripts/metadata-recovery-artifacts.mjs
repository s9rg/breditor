/** One result path per installed recovery producer, shared by the release
 * plan and the actual atomic evidence writer. Existing filenames are stable. */
import {join} from 'node:path';
import {saveEvidence} from './candidate-release/evidence.mjs';
export const metadataRecoveryArtifacts=Object.freeze({
 recoverable:'target/local-metadata-recoverable-union-installed-consumer.json',
 serverBytes:'target/local-metadata-server-bytes-installed-consumer.json',
});
export function saveMetadataRecoveryEvidence(root,kind,evidence){
 if(!Object.hasOwn(metadataRecoveryArtifacts,kind))throw Error('Choose a registered metadata recovery artifact');
 const file=join(root,metadataRecoveryArtifacts[kind]);saveEvidence(file,evidence);return file;
}
