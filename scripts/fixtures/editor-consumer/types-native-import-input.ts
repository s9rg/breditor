import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{RetainedNativeImportInput,previewSelectedNativeImport,retainSelectedNativeImport}from'../../../packages/breditor-collaboration/dist/selected_native_import/coordinator.js';
import type{SelectedNativeImportChoice}from'../../../packages/breditor-collaboration/dist/selected_native_import/contract.js';
type Assert<T extends true>=T;type Private=Assert<'RetainedNativeImportInput' extends keyof typeof Root?false:true>;
declare const owner:Parameters<typeof previewSelectedNativeImport>[0],host:Parameters<typeof previewSelectedNativeImport>[1],reads:Parameters<typeof previewSelectedNativeImport>[2],choice:SelectedNativeImportChoice,input:RetainedNativeImportInput;
void previewSelectedNativeImport(owner,host,reads,{database:'separate-input'});
void retainSelectedNativeImport(owner,host,reads,{expected:choice,approve:()=>true});
// @ts-expect-error A stored marker is not an affirmative executable decision.
void retainSelectedNativeImport(owner,host,reads,{expected:choice,approve:true});
// @ts-expect-error Retention is not an activation protocol.
void retainSelectedNativeImport(owner,host,reads,{expected:choice,approve:()=>true,activate:true});
// @ts-expect-error Input files are not a live core or writer grant.
input.file().core.dispatch({commands:[]});
// @ts-expect-error Genuine resources cannot be constructed from data.
new RetainedNativeImportInput();
void input.verifyFresh(()=>{});void input.close();
export type{Private};
