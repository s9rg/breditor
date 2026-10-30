/** A native dependency read returns immutable DATA and no writer/IO rights. */
import {readLocalMetadataRecordAssetReferences as read} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/record_references.js';
import type {SharedRichEditor} from '../../../packages/breditor-collaboration/dist/core.js';
import type {LocalMetadataDeliveryState,LocalMetadataDeliverySnapshot} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/contract.js';
declare const core:SharedRichEditor;declare const state:LocalMetadataDeliveryState;declare const snapshot:LocalMetadataDeliverySnapshot;
void read(core,state,'local',()=>{}).then(value=>{
 // @ts-expect-error Dependency data cannot activate a room or open a transport.
 value.createDelivery(core,'comment');
 if(value.outcome.kind==='pending'){
  // @ts-expect-error Pending must not expose a partial ready reference set.
  value.outcome.references;
 }else{
  // @ts-expect-error Callers cannot edit a checked dependency set.
  value.outcome.references.push({asset:'a',generation:'g'});
 }
});
// @ts-expect-error An exact native owner is required, not a matching object.
void read({},state,'local',()=>{});
// @ts-expect-error Callers must explicitly select a complete recorded point.
void read(core,snapshot,'local',()=>{});
// @ts-expect-error The private collector does not supply source factories or storage overrides.
void read(core,state,'local',{storage:{},checkAuthority(){}});
