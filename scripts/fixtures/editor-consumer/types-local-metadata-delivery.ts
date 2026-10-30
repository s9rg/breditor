/** Private composition requires the real parent and supplies no token/storage
 * replacement options. Serialized data is never a runtime execution owner. */
import {SelectedLocalReviewDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {SelectedLocalMetadataDelivery,previewSelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {RetainedDeliverySource} from '../../../packages/breditor-collaboration/dist/operation_read/delivery_retention.js';
import type {NativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
declare const parent:SelectedLocalReviewDelivery;
declare const choiceInput:Parameters<typeof previewSelectedLocalMetadataDelivery>[1];
declare const opening:Parameters<typeof SelectedLocalMetadataDelivery.open>[1];
declare const owner:SelectedLocalMetadataDelivery;
declare const source:RetainedDeliverySource;
declare const context:NativeRelayDelivery;
void previewSelectedLocalMetadataDelivery(parent,choiceInput);
void SelectedLocalMetadataDelivery.open(parent,opening);
void owner.prepare(source,context);
void owner.capture();
void owner.recovery();
// @ts-expect-error A saved/copy-shaped parent has no constructor identity.
void SelectedLocalMetadataDelivery.open({identity:()=>opening.expected.parent},opening);
// @ts-expect-error A matching snapshot is not a genuine parent either.
void previewSelectedLocalMetadataDelivery(opening.expected.parent,choiceInput);
// @ts-expect-error Current tokens belong to actual SDK transports, not data binding.
void SelectedLocalMetadataDelivery.open(parent,{...opening,getToken:()=>''});
// @ts-expect-error Callers cannot install an alternate source persistence facade.
void SelectedLocalMetadataDelivery.open(parent,{...opening,storage:{core:source.core,save(){},flush:async()=>{}}});
// @ts-expect-error Construct through genuine parent composition only.
new SelectedLocalMetadataDelivery();

import {previewSelectedLocalMetadataResume} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {previewSelectedLocalMetadataRestore,restoreSelectedLocalMetadataData} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/restore.js';
declare const resume:Parameters<typeof SelectedLocalMetadataDelivery.reopen>[1];
declare const restore:Parameters<typeof restoreSelectedLocalMetadataData>[1];
void previewSelectedLocalMetadataResume(parent,resume);
void SelectedLocalMetadataDelivery.reopen(parent,resume);
void previewSelectedLocalMetadataRestore(parent,restore);
void restoreSelectedLocalMetadataData(parent,restore).then(result=>{
 // @ts-expect-error A verified data copy supplies no runtime activation or actor grant.
 result.createDelivery(source,'comment');
});
// @ts-expect-error Restore requires the actual current parent, never saved binding data.
void restoreSelectedLocalMetadataData(opening.expected.parent,restore);
// @ts-expect-error Restore decisions cannot substitute a resume choice.
void SelectedLocalMetadataDelivery.reopen(parent,{...resume,expected:restore.expected});
// @ts-expect-error Reopening pins the actual stored metadata head.
void SelectedLocalMetadataDelivery.reopen(parent,{...resume,expected:resume.expected.delivery});
// @ts-expect-error A data copy cannot choose replacement storage or tokens.
void restoreSelectedLocalMetadataData(parent,{...restore,getToken:()=>'',storage:{}});
