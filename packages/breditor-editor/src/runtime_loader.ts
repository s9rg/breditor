/** Runtime initialization is shared; an individual aborted editor must not cancel it for others. */
export type RuntimeInput=RequestInfo|URL|Response|BufferSource|WebAssembly.Module;
export interface InitializableModule {default(input?:{module_or_path:RuntimeInput}):Promise<unknown>}
export function runtimeLoader<M extends InitializableModule>(importModule:()=>Promise<M>):(input?:RuntimeInput)=>Promise<M>{
 let pending:Promise<M>|undefined,chosen:RuntimeInput|undefined;
 return (input?:RuntimeInput)=>{
  if(pending){if(input!==undefined&&input!==chosen)return Promise.reject(Error("This runtime is already initialized with another input"));return pending;}
  chosen=input;
  const attempt=Promise.resolve().then(importModule).then(async module=>{await module.default(input===undefined?undefined:{module_or_path:input});return module;});
  pending=attempt.catch(error=>{pending=undefined;chosen=undefined;throw error;});return pending;
 };
}
