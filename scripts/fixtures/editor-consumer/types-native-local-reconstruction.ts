import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{LoadedNativeReconstructionCurrent}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import{NativeReconstructionWork}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/work_lifetime.js';
import{buildLocalReconstructionRecipe}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/local_recipe.js';
import{inspectLocalNativeReconstruction}from'../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_local.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'inspectLocalNativeReconstruction'|'buildLocalReconstructionRecipe'|'NativeReconstructionWork'|'NativeReconstructionWaits'|'NativeReconstructionFactoryScope'|'retainNativeReconstructionInput',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildLocalReconstructionRecipe>[1],owner:Parameters<typeof inspectLocalNativeReconstruction>[0],reads:Parameters<typeof inspectLocalNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectLocalNativeReconstruction>>;
void buildLocalReconstructionRecipe(source,options);
const work=new NativeReconstructionWork(source);void work.call(()=>undefined);work.close();
// @ts-expect-error A synthetic lifetime object is not an admitted complete input.
new NativeReconstructionWork({check(){},signal:new AbortController().signal});
// @ts-expect-error Explicit local reconstruction starts with a readonly document owner.
void buildLocalReconstructionRecipe(source,{...options,session:{...options.session,readOnly:false}});
// @ts-expect-error Comment editing is not a readonly reconstruction factory.
void buildLocalReconstructionRecipe(source,{...options,session:{...options.session,review:{...options.session.review,access:'comment'}}});
// @ts-expect-error Neither a cut digest nor selected counters replace the full retained file.
void inspectLocalNativeReconstruction(owner,reads,{id:'local',retained:inspection.retained.selection});
// @ts-expect-error Data inspection never grants a writer, retirement or room activation.
inspection.activate();
if(inspection.recipe.kind==='ready'){
 const file:Blob=inspection.recipe.participant.file;void file;
 const sourceFamily:'independent-local'=inspection.recipe.sourceFamily;void sourceFamily;
 // @ts-expect-error A local DATA recipe has no live source or delivery companion.
 inspection.recipe.session.core.type('not a source');
 // @ts-expect-error Input retention is not acknowledgement of a source write.
 inspection.recipe.acknowledge();
 // @ts-expect-error A recipe never manufactures a successor room grant.
 inspection.recipe.successor.activate();
}
export type{Private};
