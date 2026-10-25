import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{previewNativeExecution,executeNativeExecution,previewNativeExecutionResume,resumeNativeExecution}from'../../../packages/breditor-collaboration/dist/selected_native_execution/coordinator.js';
import{openRetainedNativeImportInput}from'../../../packages/breditor-collaboration/dist/selected_native_import/coordinator.js';
import type{NativeExecutionStartChoice,NativeExecutionResumeChoice,NativeExecutionResult,NativeExecutionIdentity}from'../../../packages/breditor-collaboration/dist/selected_native_execution/contract.js';
type Assert<T extends true>=T;type Private=Assert<'executeNativeExecution' extends keyof typeof Root?false:true>;
declare const owner:Parameters<typeof previewNativeExecution>[0],input:Parameters<typeof previewNativeExecution>[1],host:Parameters<typeof previewNativeExecution>[2],reads:Parameters<typeof previewNativeExecution>[3],start:NativeExecutionStartChoice,resume:NativeExecutionResumeChoice,identity:NativeExecutionIdentity,result:NativeExecutionResult;
void previewNativeExecution(owner,input,host,reads,{database:'separate-journal'});
void executeNativeExecution(owner,input,host,reads,{expected:start,approve:()=>true});
void previewNativeExecutionResume(owner,host,reads,{identity});
void resumeNativeExecution(owner,host,reads,{expected:resume,approve:()=>true});
void openRetainedNativeImportInput({expected:identity.input,wasm:undefined as never,checkAuthority(){}});
// @ts-expect-error Every retry requires an executable current decision.
void resumeNativeExecution(owner,host,reads,{expected:resume,approve:true});
// @ts-expect-error A start choice has no selected existing journal head/current cut.
void resumeNativeExecution(owner,host,reads,{expected:start,approve:()=>true});
// @ts-expect-error Saved READ evidence is not an acknowledgement or activation.
result.activate();
// @ts-expect-error A result is data, not an editable native core.
result.core.dispatch({commands:[]});
// @ts-expect-error No truncation or skip-already-imported switch.
void executeNativeExecution(owner,input,host,reads,{expected:start,approve:()=>true,skipImported:true});
export type{Private};

