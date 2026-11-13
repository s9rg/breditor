/** Internal entry-point fence. The caller has already selected the literal
 * archive. Each leaf checks its own opened input before touching components. */
export type ExactOperationRecoveryInput=(file:Blob)=>Promise<void>;
const checks=new WeakMap<object,ExactOperationRecoveryInput>();

export function withExactOperationRecoveryInput<T extends object>(options:T,check:ExactOperationRecoveryInput):T{
 checks.set(options,check);
 return options;
}

export function exactOperationRecoveryInput(options:object){
 return checks.get(options);
}
