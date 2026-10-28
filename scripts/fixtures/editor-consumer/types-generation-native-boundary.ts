import {previewSelectedGenerationNativeImport,RetainedGenerationNativeImportInput} from '../../../packages/breditor-collaboration/dist/selected_generation_import/coordinator.js';
import {previewGenerationNativeExecution,executeGenerationNativeExecution} from '../../../packages/breditor-collaboration/dist/selected_generation_execution/coordinator.js';
import type {SelectedGenerationNativeImportChoice} from '../../../packages/breditor-collaboration/dist/selected_generation_import/contract.js';
import type {SharedServerLogGenerationRecoveryHost,SharedPhysicalRoomRecoveryHost} from '@breditor/collaboration';
import type {RetainedNativeImportInput} from '../../../packages/breditor-collaboration/dist/selected_native_import/coordinator.js';
import type {SelectedNativeImportChoice} from '../../../packages/breditor-collaboration/dist/selected_native_import/contract.js';
declare const owner:Parameters<typeof previewGenerationNativeExecution>[0],reads:Parameters<typeof previewGenerationNativeExecution>[3],generation:SharedServerLogGenerationRecoveryHost,physical:SharedPhysicalRoomRecoveryHost,input:RetainedGenerationNativeImportInput,old:RetainedNativeImportInput,choice:SelectedGenerationNativeImportChoice,oldChoice:SelectedNativeImportChoice;
// @ts-expect-error Genuine physical controls never supply generation authority.
await previewSelectedGenerationNativeImport(owner,physical,reads,{database:'input'});
// @ts-expect-error A physical retained input cannot stand in for generation custody.
await previewGenerationNativeExecution(owner,old,generation,reads,{database:'progress'});
// @ts-expect-error Serialized physical choices remain a different data family.
const invalid:SelectedGenerationNativeImportChoice=oldChoice;
// @ts-expect-error A new data choice does not supply input store ownership.
await previewGenerationNativeExecution(owner,choice,generation,reads,{database:'progress'});
// @ts-expect-error Execution never accepts a skip or activate switch.
await executeGenerationNativeExecution(owner,input,generation,reads,{expected:undefined as never,approve:()=>true,activate:true});
