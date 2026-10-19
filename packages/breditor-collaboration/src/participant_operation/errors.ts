export class SharedParticipantOperationError extends Error{
 readonly code:string;
 constructor(code="operation_storage"){super("The participant operation could not retain or verify its selected recovery state");this.name="SharedParticipantOperationError";this.code=code;}
}
export const operationFailure=(code="operation_storage")=>new SharedParticipantOperationError(code);
export function operationSignal(signal?:AbortSignal):void{if(signal?.aborted)throw operationFailure("operation_aborted");}
export function operationName(name:unknown):asserts name is string{if(typeof name!=="string"||!name||name.length>200)throw operationFailure("operation_policy");}
