import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import type {SharedAssetBytesPending} from '../../../packages/breditor-collaboration/dist/asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildLocalInputReconstructionRecipe} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/local_input_recipe.js';
import {inspectLocalInputNativeReconstruction} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_local_input.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'buildLocalInputReconstructionRecipe'|'inspectLocalInputNativeReconstruction'|'admitLocalInputReconstructionRecords'|'seedFlatLocalSnapshot',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildLocalInputReconstructionRecipe>[1],owner:Parameters<typeof inspectLocalInputNativeReconstruction>[0],reads:Parameters<typeof inspectLocalInputNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectLocalInputNativeReconstruction>>;
void buildLocalInputReconstructionRecipe(source,options);
// @ts-expect-error Editing permission is not a readonly graph reconstruction factory.
void buildLocalInputReconstructionRecipe(source,{...options,session:{...options.session,readOnly:false}});
// @ts-expect-error Comment editing cannot be selected by retained incoming DATA.
void buildLocalInputReconstructionRecipe(source,{...options,session:{...options.session,review:{...options.session.review,access:'comment'}}});
// @ts-expect-error Complete retained files, not a selection digest, are required.
void inspectLocalInputNativeReconstruction(owner,reads,{id:'graph',retained:inspection.retained.selection});
// @ts-expect-error A current native descriptor must be supplied independently.
void buildLocalInputReconstructionRecipe(source,{id:'graph',outputFamily:'local-operation-flat',session:options.session});
if(inspection.recipe.kind==='ready'){
 const file:Blob=inspection.recipe.participant.file;void file;
 const family:'local-operation-flat'=inspection.recipe.family;void family;
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

// @ts-expect-error Output conversion must be explicitly selected, never inferred.
void inspectLocalInputNativeReconstruction(owner,reads,{id:'local',retained:inspection.retained});
// @ts-expect-error Snapshot-v1 save markers are not a flat recovery output choice.
void buildLocalInputReconstructionRecipe(source,{...options,outputFamily:'local-operation-snapshot'});
