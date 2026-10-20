/** Private actual-session registration. Saved fields and copied options mint no source custody. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import type {SegmentedSessionIdentity} from "../persistence/segmented_contract.js";
import type {GenerationSourcePort} from "./contract.js";
const sources=new WeakMap<object,GenerationSourcePort>(),natives=new WeakMap<object,GenerationNativePort>();
export interface GenerationNativePort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly identity:Readonly<SegmentedSessionIdentity>;
 readonly review:Readonly<{actor:string;principal:string}>|null;readonly companion:boolean;
 check():void;checkManaged():void;stamp():object;read():SharedSegmentedRecovery;
}
export function registerGenerationNative(session:object,port:GenerationNativePort):void{if(natives.has(session))throw Error("Generation source reused");natives.set(session,port);}
export function generationNative(session:object):GenerationNativePort{const p=natives.get(session);if(!p)throw Error("An actual native generation session is required");p.check();return p;}
export function registerGenerationSource(session:object,port:GenerationSourcePort):void{if(sources.has(session))throw Error("Generation source reused");sources.set(session,port);}
export function generationSource(session:object):GenerationSourcePort{const p=sources.get(session);if(!p)throw Error("An actual explicitly selected generation source is required");p.check();return p;}
