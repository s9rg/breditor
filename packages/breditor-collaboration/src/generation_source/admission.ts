/** Private actual-session registration. Saved fields and copied options mint no source custody. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import type {SegmentedSessionIdentity} from "../persistence/segmented_contract.js";
import type {GenerationSourcePort,ContinuedGenerationRecordSource} from "./contract.js";
import {checkManagedCore} from "../managed_custody.js";
const sources=new WeakMap<object,GenerationSourcePort>(),continuedReaders=new WeakMap<object,ContinuedGenerationRecordSource>(),natives=new WeakMap<object,GenerationNativePort>();
export interface GenerationNativePort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly identity:Readonly<SegmentedSessionIdentity>;
 readonly review:Readonly<{actor:string;principal:string}>|null;readonly companion:boolean;
 check():void;checkManaged():void;stamp():object;read():SharedSegmentedRecovery;
}
// Preserve the original storage/session refusal precedence. A readable native
// history alone still cannot return a retired core as an editable managed owner.
export function registerGenerationNative(session:object,port:GenerationNativePort):void{if(natives.has(session))throw Error("Generation source reused");const core=port.core;natives.set(session,Object.freeze({...port,checkManaged(){port.checkManaged();checkManagedCore(core);}}));}
export function generationNative(session:object):GenerationNativePort{const p=natives.get(session);if(!p)throw Error("An actual native generation session is required");p.check();return p;}
export function registerGenerationSource(session:object,port:GenerationSourcePort):void{if(sources.has(session))throw Error("Generation source reused");const core=port.core;sources.set(session,Object.freeze({...port,checkManaged(){port.checkManaged();checkManagedCore(core);}}));}
export function generationSource(session:object):GenerationSourcePort{const p=sources.get(session);if(!p)throw Error("An actual explicitly selected generation source is required");p.check();return p;}

/** A record reader can observe a failed save while the same native owner remains held. */
export function registerContinuedRecordSource(session:object,port:ContinuedGenerationRecordSource):void{
 registerGenerationSource(session,port);
 continuedReaders.set(session,Object.freeze({...port,continuedRecordRead:Object.freeze(port.continuedRecordRead)}));
}
export function generationRecordSource(session:object):ContinuedGenerationRecordSource|GenerationSourcePort{
 const continued=continuedReaders.get(session);
 if(!continued)return generationSource(session);
 continued.continuedRecordRead.check();
 return continued;
}
