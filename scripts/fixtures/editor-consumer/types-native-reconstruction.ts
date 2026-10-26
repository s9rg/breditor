import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{LoadedNativeReconstructionCurrent}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import{buildOriginalReconstructionRecipe}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/original_recipe.js';
import{inspectOriginalNativeReconstruction}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_original.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'inspectOriginalNativeReconstruction'|'admitOriginalReconstructionParent'|'admitLocalReconstructionParent',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildOriginalReconstructionRecipe>[1],owner:Parameters<typeof inspectOriginalNativeReconstruction>[0],reads:Parameters<typeof inspectOriginalNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectOriginalNativeReconstruction>>;
void buildOriginalReconstructionRecipe(source,options);
// @ts-expect-error No alleged source tree or selected counters replace the admitted complete file.
void buildOriginalReconstructionRecipe({document:'{}'},options);
// @ts-expect-error The loaded reader has no public constructor accepting metadata.
new LoadedNativeReconstructionCurrent({});
// @ts-expect-error A retained selection alone omits the complete retained file.
void inspectOriginalNativeReconstruction(owner,reads,{id:'original',retained:inspection.retained.selection});
// @ts-expect-error Inspection cannot retire owners or grant editing.
inspection.activate();
// @ts-expect-error Native source mutation is absent from DATA output.
inspection.recipe.core.type('not a core');
if(inspection.recipe.kind==='ready'){
 const selected=inspection.recipe.participant.selection;void selected;
 // @ts-expect-error A participant file is not a save acknowledgement or server grant.
 inspection.recipe.acknowledge();
}
export type{Private};
