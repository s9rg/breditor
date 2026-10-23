/** Independently verify immutable file DATA, including after a parent input
 * wrapper is retired. This never supplies native ownership or permission. */
import {FlatLocalProvenance,flatLocalFraming} from './framing.js';import {flatLocalFailure as fail} from './failure.js';
export async function verifyFlatLocalLiteral(file:Blob,selected:Readonly<{bytes:number;mime:string;manifestSha256:string}>,guard:()=>void):Promise<void>{guard();if(!(file instanceof Blob)||file.size!==selected.bytes||file.type!==selected.mime)throw fail('flat_local_input_changed');let data:FlatLocalProvenance|undefined;try{data=await flatLocalFraming.read.call(FlatLocalProvenance,file,{manifestSha256:selected.manifestSha256},guard);guard();}finally{if(data)flatLocalFraming.dispose.call(data);}guard();}
