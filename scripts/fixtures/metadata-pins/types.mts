/** Portable DATA and scoped live admission remain distinct private contracts. */
import {captureMetadataContinuationPins} from '../../../packages/breditor-collaboration/dist/metadata_continuation_pins/capture.js';
import {captureMetadataContinuationPinArchive} from '../../../packages/breditor-collaboration/dist/metadata_continuation_pins/capture_archive.js';
import {readMetadataContinuationPinArchive} from '../../../packages/breditor-collaboration/dist/metadata_continuation_pins/read_archive.js';
import {withHeldMetadataContinuationPins} from '../../../packages/breditor-collaboration/dist/metadata_continuation_pins/held_evidence.js';
import type {MetadataContinuationEvidencePins,MetadataContinuationPinArchive} from '../../../packages/breditor-collaboration/dist/metadata_continuation_pins/contract.js';
import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';
import type {MetadataContinuationEvidence} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/evidence_contract.js';
declare const data:MetadataContinuationEvidence,options:SharedArchiveIntegrityOptions;
declare const scope:Parameters<typeof withHeldMetadataContinuationPins>[0],original:Parameters<typeof withHeldMetadataContinuationPins>[1];
const pins:Promise<MetadataContinuationEvidencePins>=captureMetadataContinuationPins(data,options);
const archive:Promise<MetadataContinuationPinArchive>=captureMetadataContinuationPinArchive(data,options);
void archive.then(value=>readMetadataContinuationPinArchive(value,value.pins,options));
void pins.then(value=>withHeldMetadataContinuationPins(scope,original,value,async held=>{held.check();void held.pins;
 // @ts-expect-error portable pins never provide a Native owner
 held.takeOwner();
}));
// @ts-expect-error the original text record is not an independent compact selection
void readMetadataContinuationPinArchive(data,data,options);
void archive.then(value=>{
 // @ts-expect-error retaining an archive does not provide a live journal visitor
 value.check();
 // @ts-expect-error compact selection is deeply readonly
 value.pins.review!.bytes=0;
 // @ts-expect-error an archive body cannot be silently dropped
 value.review=null;
});
