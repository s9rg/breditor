/** Genuine detached graph input. Native replay belongs to its data reader;
 * actual publication/leases belong to the sealed shared journal machinery. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {copyOperationCut,sameOperationCut} from '../independent_operation/cut_codec.js';
import {FlatLocalArchive,flatLocalArchive as archive} from './archive.js';
import {verifyFlatLocalLiteral} from './literal_file.js';
import {snapshotFlatLocalPolicy,type FlatLocalInputOptions} from './policy.js';
import {makeFlatLocalIdentity} from './identity.js';import {wrapFlatLocalHead,type FlatLocalIdentity} from './head.js';
import {flatLocalFailure as fail} from './failure.js';
const key=Object.freeze({});
interface State{readonly policy:ReturnType<typeof snapshotFlatLocalPolicy>;readonly owner:FlatLocalArchive;readonly file:Blob;readonly identity:FlatLocalIdentity;readonly targets:readonly IndependentHistoryCut[]}
const states=new WeakMap<DetachedFlatLocalInput,State>();
function state(owner:DetachedFlatLocalInput):State{const s=states.get(owner);if(!s||archive.file.call(s.owner)!==s.file)throw fail('flat_local_input_closed');return s;}
export class DetachedFlatLocalInput{
 readonly #constructorKey=key;
 private constructor(token:object,value:State){if(token!==this.#constructorKey)throw fail();states.set(this,value);Object.freeze(this);}
 static async read<P extends SharedSelectionPolicy>(file:Blob,provided:FlatLocalInputOptions<P>):Promise<DetachedFlatLocalInput>{
  if(this!==DetachedFlatLocalInput)throw fail();const policy=snapshotFlatLocalPolicy(provided),guard=policy.guard;guard();let owner:FlatLocalArchive|undefined,done=false;
  try{owner=await archive.read.call(FlatLocalArchive,file,policy.expected,{session:policy.read.options.session,checkAuthority:guard,limits:policy.read.options.limits,...(policy.read.options.signal?{signal:policy.read.options.signal}:{})});guard();const bytes=archive.file.call(owner),identity=await makeFlatLocalIdentity(policy.expected,bytes.size,policy.database,policy.sourceDatabase,policy.cohort);guard();const targets:IndependentHistoryCut[]=[];
   for(const recovery of archive.targets.call(owner)){const native=await makeIndependentHistoryCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);guard();const target={head:wrapFlatLocalHead(native.head,identity),files:native.files};if(!targets.length||!sameOperationCut(target,targets.at(-1)!))targets.push(copyOperationCut(target));}
   guard();const result=new DetachedFlatLocalInput(key,{policy,owner,file:bytes,identity,targets});done=true;return result;
  }finally{if(!done&&owner)archive.dispose.call(owner);}
 }
 check():void{state(this);}
 async verifyFile(file:Blob,guard:()=>void):Promise<void>{
  const s=state(this);await verifyFlatLocalLiteral(file,{bytes:s.file.size,mime:s.file.type,manifestSha256:s.policy.expected.manifestSha256},guard);guard();state(this);
 }
 file():Blob{return state(this).file;}
 originalFile():Blob{return archive.originalFile.call(state(this).owner);}
 selection(){return structuredClone(state(this).policy.expected);}
 cohort(){return structuredClone(state(this).policy.cohort);}
 identity():FlatLocalIdentity{return structuredClone(state(this).identity);}
 live(){return archive.live.call(state(this).owner);}
 targets():readonly IndependentHistoryCut[]{return state(this).targets.map(copyOperationCut);}
 uploads():Blob{return archive.uploads.call(state(this).owner);}
 blob(asset:string,generation:string):Blob|undefined{return archive.blob.call(state(this).owner,asset,generation);}
 dispose():void{const s=states.get(this);if(s){states.delete(this);archive.dispose.call(s.owner);}}
}
const p=DetachedFlatLocalInput.prototype;
export const flatLocalInput=Object.freeze({read:DetachedFlatLocalInput.read,check:p.check,verifyFile:p.verifyFile,file:p.file,originalFile:p.originalFile,selection:p.selection,cohort:p.cohort,identity:p.identity,live:p.live,targets:p.targets,uploads:p.uploads,blob:p.blob,dispose:p.dispose});
