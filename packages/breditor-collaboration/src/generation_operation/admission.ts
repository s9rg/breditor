import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Private per-call cold-open admission. Stored flags cannot request origin-aware adoption. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SegmentedSessionCompanion} from "../persistence/segmented_driver.js";
export interface GenerationOperationOrigin {check():void;verifyCore(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[],companion:SegmentedSessionCompanion|undefined):void}
const selected=new WeakMap<object,GenerationOperationOrigin>();
export function withGenerationOperationOrigin<T extends object>(options:T,origin:GenerationOperationOrigin):T{const copy=inheritActorLeaseInput(options,{...options});selected.set(copy,origin);return copy;}
export const generationOperationOrigin=(options:object)=>selected.get(options);
export function inheritGenerationOperationOrigin<T extends object>(from:object,to:T):T{const origin=selected.get(from);if(origin)selected.set(to,origin);return to;}
