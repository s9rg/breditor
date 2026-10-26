import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {LoadedNativeReconstructionCurrent} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildDeliveryReconstructionRecipe} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/delivery_recipe.js';
import {inspectDeliveryNativeReconstruction} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_delivery.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'buildDeliveryReconstructionRecipe'|'inspectDeliveryNativeReconstruction'|'verifyDeliveryReconstructionPackets',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildDeliveryReconstructionRecipe>[1],owner:Parameters<typeof inspectDeliveryNativeReconstruction>[0],reads:Parameters<typeof inspectDeliveryNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectDeliveryNativeReconstruction>>;
void buildDeliveryReconstructionRecipe(source,options);
// @ts-expect-error Editing permission is not a readonly native reconstruction factory.
void buildDeliveryReconstructionRecipe(source,{...options,session:{...options.session,readOnly:false}});
// @ts-expect-error Comment editing cannot be selected by retained incoming DATA.
void buildDeliveryReconstructionRecipe(source,{...options,session:{...options.session,review:{...options.session.review,access:'comment'}}});
// @ts-expect-error Complete retained files, not counters or digests, are required.
void inspectDeliveryNativeReconstruction(owner,reads,{id:'delivery',retained:inspection.retained.selection});
// @ts-expect-error Inspection never grants room activation.
inspection.activate();
if(inspection.recipe.kind==='ready'){
 const file:Blob=inspection.recipe.participant.file;void file;
 const family:'independent-delivery'=inspection.recipe.sourceFamily;void family;
 // @ts-expect-error DATA backup construction is not a source-write acknowledgement.
 inspection.recipe.acknowledge();
 // @ts-expect-error A participant file is not a live source or author lease.
 inspection.recipe.session.core.type('not an editable source');
 // @ts-expect-error Pending review decisions remain DATA, never a server finalization.
 inspection.recipe.finalizeSuggestion();
}
export type {Private};
