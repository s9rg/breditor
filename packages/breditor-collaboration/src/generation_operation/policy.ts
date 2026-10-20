/** Operational custody failures never echo the original document, packets or provider receipts. */
export class SharedGenerationOperationError extends Error {
 constructor(readonly code:"generation_operation_policy"|"generation_operation_closed"|"generation_operation_busy"|"generation_operation_missing"|"generation_operation_diverged"|"generation_operation_storage"|"generation_operation_versionchange"|"generation_operation_origin",message:string){super(message);this.name="SharedGenerationOperationError";}
}
export const generationOperationFailure=(code:SharedGenerationOperationError["code"]="generation_operation_storage")=>new SharedGenerationOperationError(code,"Generation operation requires the selected retained source, native ancestry and current host authority");
