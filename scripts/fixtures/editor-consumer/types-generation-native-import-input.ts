import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{RetainedGenerationNativeImportInput,previewSelectedGenerationNativeImport,retainSelectedGenerationNativeImport}from'../../../packages/breditor-collaboration/dist/selected_generation_import/coordinator.js';
import type{SelectedGenerationNativeImportChoice}from'../../../packages/breditor-collaboration/dist/selected_generation_import/contract.js';
type Assert<T extends true>=T;type Private=Assert<'RetainedGenerationNativeImportInput' extends keyof typeof Root?false:true>;
declare const owner:Parameters<typeof previewSelectedGenerationNativeImport>[0],host:Parameters<typeof previewSelectedGenerationNativeImport>[1],reads:Parameters<typeof previewSelectedGenerationNativeImport>[2],choice:SelectedGenerationNativeImportChoice,input:RetainedGenerationNativeImportInput;
void previewSelectedGenerationNativeImport(owner,host,reads,{database:'separate-input'});
void retainSelectedGenerationNativeImport(owner,host,reads,{expected:choice,approve:()=>true});
// @ts-expect-error A stored marker is not an affirmative executable decision.
void retainSelectedGenerationNativeImport(owner,host,reads,{expected:choice,approve:true});
// @ts-expect-error Retention is not an activation protocol.
void retainSelectedGenerationNativeImport(owner,host,reads,{expected:choice,approve:()=>true,activate:true});
// @ts-expect-error Input files are not a live core or writer grant.
input.file().core.dispatch({commands:[]});
// @ts-expect-error Genuine resources cannot be constructed from data.
new RetainedGenerationNativeImportInput();
void input.verifyFresh(()=>{});void input.close();
export type{Private};
