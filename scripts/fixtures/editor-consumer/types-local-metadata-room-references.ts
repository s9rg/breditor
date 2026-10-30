/** One complete, immutable dependency decision; DATA is never availability. */
import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {LocalMetadataRoomBundle} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReferenceBundle,LocalMetadataReferenceCut} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/room_contract.js';
declare const owner:SelectedLocalMetadataDelivery;declare const body:LocalMetadataReferenceCut;declare const bundle:LocalMetadataReferenceBundle;
void owner.captureReferences().then(value=>{const original:LocalMetadataRoomBundle=value.parent;void original;
 // @ts-expect-error A reference export is distinct from the old metadata envelope.
 const old:LocalMetadataRoomBundle=value;void old;
 // @ts-expect-error No native actor, upload capability or activation is returned.
 value.activate();
});
// @ts-expect-error Required recorded points/lanes cannot be omitted by options.
void owner.captureReferences({includeStored:false});
if(body.outcome.kind==='pending'){
 // @ts-expect-error Global Pending must not expose partial Ready references.
 body.outcome.references;
}else{
 // @ts-expect-error Checked data is immutable.
 body.outcome.references.push({asset:'a',generation:'g'});
}
// @ts-expect-error The literal old parent cannot be replaced by reference DATA.
const old:LocalMetadataRoomBundle=bundle;void old;
void owner.inspectReferences(bundle).then(value=>{
 const checked:LocalMetadataReferenceCut=value;void checked;
 // @ts-expect-error Native-inspected dependency DATA supplies no provider/actor grant.
 value.activate();
 // @ts-expect-error No metadata source can be replaced through a read result.
 value.stored.revision=0;
});
// @ts-expect-error A plain old metadata bundle has no complete reference file.
void owner.inspectReferences(bundle.parent);
// @ts-expect-error Callers cannot omit original cuts or skip native verification.
void owner.inspectReferences(bundle,{verifyNative:false});
