
/** Independent read failures. No failure can substitute an empty complete inventory. */
export class ServerNativeDependencyError extends Error {
 readonly code:'native_dependencies_policy'|'native_dependencies_protocol'|'native_dependencies_busy';
 constructor(code:ServerNativeDependencyError['code']){super(code);this.name='ServerNativeDependencyError';this.code=code;}
}
export const fail=(code:ServerNativeDependencyError['code']='native_dependencies_protocol')=>new ServerNativeDependencyError(code);
