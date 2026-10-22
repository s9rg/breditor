/** Stable public shared-editor failure identity, independent of native-owner lifecycle modules. */
export class SharedEditorError extends Error {
 constructor(readonly code:string,message:string){super(message);this.name='SharedEditorError';}
}
