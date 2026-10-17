import type {SharedDocumentVersionInfo,SharedNativeVersionPlan,SharedVersionComparison} from "./version_types.js";
const plans=new WeakMap<SharedDocumentVersionRestorePlan,{owner:object;raw:SharedNativeVersionPlan}>();
/** Opaque native-owned restore with independently retained read values. Dispose it after use/refusal. */
export class SharedDocumentVersionRestorePlan {
 readonly #document:string;readonly #version:string;readonly #comparison:string;readonly #closed:()=>void;
 /** @internal Use SharedRichEditor.prepareVersionRestore; native proof still guards all publication. */
 constructor(owner:object,raw:SharedNativeVersionPlan,closed:()=>void){this.#closed=closed;try{this.#document=raw.document_json();this.#version=raw.version_json();this.#comparison=raw.comparison_json();plans.set(this,{owner,raw});}catch(error){raw.free();throw error;}}
 /** Fully admitted fresh content; remains readable after native proof disposal. */
 documentJson():string{return this.#document;}
 version():SharedDocumentVersionInfo{return JSON.parse(this.#version) as SharedDocumentVersionInfo;}
 comparison():SharedVersionComparison{return JSON.parse(this.#comparison) as SharedVersionComparison;}
 dispose():void{const plan=plans.get(this);if(!plan)return;plans.delete(this);plan.raw.free();this.#closed();}
}
/** @internal Exact owner identity complements the native observation; callers cannot edit the proof. */
export function nativeVersionPlan(owner:object,plan:SharedDocumentVersionRestorePlan):SharedNativeVersionPlan{const value=plans.get(plan);if(!value||value.owner!==owner)throw Error("Version restore plan is disposed or belongs to another editor");return value.raw;}
