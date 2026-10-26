import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {LoadedNativeReconstructionCurrent} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildGenerationReconstructionRecipe} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/generation_recipe.js';
import {inspectGenerationNativeReconstruction} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_generation.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'buildGenerationReconstructionRecipe'|'inspectGenerationNativeReconstruction'|'admitGenerationReconstructionRecords'|'verifyRetainedReconstructionPackets'|'encodeGenerationAssetData',keyof typeof Root> extends never?true:false>;
declare const source:LoadedNativeReconstructionCurrent,options:Parameters<typeof buildGenerationReconstructionRecipe>[1],owner:Parameters<typeof inspectGenerationNativeReconstruction>[0],reads:Parameters<typeof inspectGenerationNativeReconstruction>[1],inspection:Awaited<ReturnType<typeof inspectGenerationNativeReconstruction>>;
void buildGenerationReconstructionRecipe(source,options);
// @ts-expect-error Original-journal factories cannot silently select segmented native replay.
void buildGenerationReconstructionRecipe(source,{...options,read:{restore(){throw Error('not segmented');}}});
// @ts-expect-error The expected native descriptor is an independent explicit read choice.
void buildGenerationReconstructionRecipe(source,{id:options.id,read:options.read});
// @ts-expect-error Native history facets cannot be selected through nested editor overrides.
void buildGenerationReconstructionRecipe(source,{...options,read:{...options.read,editor:{segmentedHistory:'segmented-v1'}}});
// @ts-expect-error A digest or facade revision is not the complete retained room file.
void inspectGenerationNativeReconstruction(owner,reads,{id:'generation',retained:inspection.retained.selection});
// @ts-expect-error An inspection is not a room activation grant.
inspection.activate();
if(inspection.recipe.kind==='ready'){
 const file:Blob=inspection.recipe.participant.file;void file;
 const family:'generation'=inspection.recipe.sourceFamily;void family;
 const kind:'local'|'relay'|'retained'=inspection.recipe.participant.selection.identity.source.kind;void kind;
 // @ts-expect-error A generation participant DATA file is not a live editable source.
 inspection.recipe.session.core.type('not a source');
 // @ts-expect-error File construction cannot acknowledge the original failed save.
 inspection.recipe.acknowledge();
 // @ts-expect-error No old-writer retirement capability is restored from bytes.
 inspection.recipe.retireOldSource();
}
export type {Private};
