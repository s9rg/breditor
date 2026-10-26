import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import type {SharedAssetBytesPending} from '../../../packages/breditor-collaboration/dist/asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildGraphReconstructionRecipe} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/graph_recipe.js';
import {inspectGraphNativeReconstruction} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_graph.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'buildGraphReconstructionRecipe'|'inspectGraphNativeReconstruction'|'appendRestoredGraphFrame'|'flattenRestoredGraphInput',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildGraphReconstructionRecipe>[1],owner:Parameters<typeof inspectGraphNativeReconstruction>[0],reads:Parameters<typeof inspectGraphNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectGraphNativeReconstruction>>;
void buildGraphReconstructionRecipe(source,options);
// @ts-expect-error Editing permission is not a readonly graph reconstruction factory.
void buildGraphReconstructionRecipe(source,{...options,session:{...options.session,readOnly:false}});
// @ts-expect-error Comment editing cannot be selected by retained incoming DATA.
void buildGraphReconstructionRecipe(source,{...options,session:{...options.session,review:{...options.session.review,access:'comment'}}});
// @ts-expect-error Complete retained files, not a selection digest, are required.
void inspectGraphNativeReconstruction(owner,reads,{id:'graph',retained:inspection.retained.selection});
// @ts-expect-error A current native descriptor must be supplied independently.
void buildGraphReconstructionRecipe(source,{id:'graph',session:options.session});
if(inspection.recipe.kind==='ready'){
 const file:Blob=inspection.recipe.participant.file;void file;
 const family:'restored-graph'=inspection.recipe.family;void family;
 // @ts-expect-error DATA is not an actual source-save acknowledgement.
 inspection.recipe.acknowledge();
 // @ts-expect-error Immutable graph construction is not a source or author lease.
 inspection.recipe.session.core.type('not a live source');
 // @ts-expect-error Reconstructed packets cannot finalize a server review decision.
 inspection.recipe.finalizeSuggestion();
}else{const pending:readonly SharedAssetBytesPending[]=inspection.recipe.pending;void pending;}
// @ts-expect-error Inspection never grants whole-room activation.
inspection.activate();
export type {Private};
