import type*as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {inspectGenerationJournalReconstruction as inspect,prepareGenerationJournalReconstruction as prepare,readGenerationJournalReconstruction as read,previewGenerationReconstructionMaterialization as preview,materializeGenerationReconstruction as materialize} from '../../../packages/breditor-collaboration/dist/selected_generation_reconstruction/coordinator.js';
import type {GenerationReconstructionChoice,GenerationReconstructionMaterializationChoice,GenerationReconstructionInspectionOptions,GenerationReconstructionReadOptions} from '../../../packages/breditor-collaboration/dist/selected_generation_reconstruction/contract.js';
import type {SharedPhysicalRoomRecoveryHost} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
type Assert<T extends true>=T;type Private=Assert<'materializeGenerationReconstruction' extends keyof typeof Root?false:true>;
declare const owner:Parameters<typeof inspect>[0],host:Parameters<typeof inspect>[1],reads:Parameters<typeof inspect>[2],options:GenerationReconstructionInspectionOptions,choice:GenerationReconstructionChoice,decision:GenerationReconstructionMaterializationChoice,readOptions:GenerationReconstructionReadOptions,physical:SharedPhysicalRoomRecoveryHost;
void inspect(owner,host,reads,options);void prepare(owner,host,reads,{expected:choice,approve:()=>true});void read(choice,readOptions);void preview(owner,host,reads,{reconstruction:choice});const result=materialize(owner,host,reads,{expected:decision,approve:()=>true});
// @ts-expect-error A physical host is not generation authority.
void inspect(owner,physical,reads,options);
// @ts-expect-error DATA choices never store executable decisions.
void prepare(owner,host,reads,{expected:choice,approve:true});
// @ts-expect-error A saved bridge alone is not a fresh actual-source decision.
void materialize(owner,host,reads,{expected:choice,approve:()=>true});
// @ts-expect-error No native-import skip, ACK or activation option.
void materialize(owner,host,reads,{expected:decision,approve:()=>true,activate:true});
void result.then(value=>{
 // @ts-expect-error An immutable execution file is not a live editable owner.
 value.clients[0].core.type('not owned');
 // @ts-expect-error Local reconstruction DATA never grants remote serving.
 value.activate();
});export type{Private};
