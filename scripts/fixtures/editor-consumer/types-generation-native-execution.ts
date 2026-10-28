import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{previewGenerationNativeExecution,executeGenerationNativeExecution,previewGenerationNativeExecutionResume,resumeGenerationNativeExecution}from'../../../packages/breditor-collaboration/dist/selected_generation_execution/coordinator.js';
import{openRetainedGenerationNativeImportInput}from'../../../packages/breditor-collaboration/dist/selected_generation_import/coordinator.js';
import type{GenerationNativeExecutionStartChoice,GenerationNativeExecutionResumeChoice,GenerationNativeExecutionResult,GenerationNativeExecutionIdentity}from'../../../packages/breditor-collaboration/dist/selected_generation_execution/contract.js';
type Assert<T extends true>=T;type Private=Assert<'executeGenerationNativeExecution' extends keyof typeof Root?false:true>;
declare const owner:Parameters<typeof previewGenerationNativeExecution>[0],input:Parameters<typeof previewGenerationNativeExecution>[1],host:Parameters<typeof previewGenerationNativeExecution>[2],reads:Parameters<typeof previewGenerationNativeExecution>[3],start:GenerationNativeExecutionStartChoice,resume:GenerationNativeExecutionResumeChoice,identity:GenerationNativeExecutionIdentity,result:GenerationNativeExecutionResult;
void previewGenerationNativeExecution(owner,input,host,reads,{database:'separate-journal'});
void executeGenerationNativeExecution(owner,input,host,reads,{expected:start,approve:()=>true});
void previewGenerationNativeExecutionResume(owner,host,reads,{identity});
void resumeGenerationNativeExecution(owner,host,reads,{expected:resume,approve:()=>true});
void openRetainedGenerationNativeImportInput({expected:identity.input,wasm:undefined as never,checkAuthority(){}});
// @ts-expect-error Every retry requires an executable current decision.
void resumeGenerationNativeExecution(owner,host,reads,{expected:resume,approve:true});
// @ts-expect-error A start choice has no selected existing journal head/current cut.
void resumeGenerationNativeExecution(owner,host,reads,{expected:start,approve:()=>true});
// @ts-expect-error Saved READ evidence is not an acknowledgement or activation.
result.activate();
// @ts-expect-error A result is data, not an editable native core.
result.core.dispatch({commands:[]});
// @ts-expect-error No truncation or skip-already-imported switch.
void executeGenerationNativeExecution(owner,input,host,reads,{expected:start,approve:()=>true,skipImported:true});
export type{Private};
