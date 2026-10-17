import type {SharedNativeSuggestionEffectProof,SharedSuggestionEffectSummary} from "./reviewed_history_types.js";
const proofs=new WeakMap<SharedDocumentSuggestionEffectProof,{owner:object;raw:SharedNativeSuggestionEffectProof}>();
/** Frozen native semantic evidence, not server finality, owned history or a transferable credential. */
export class SharedDocumentSuggestionEffectProof {
 readonly #summary:string;readonly #closed:()=>void;
 /** @internal Construct only through SharedRichEditor.verifySuggestionEffect. */
 constructor(owner:object,raw:SharedNativeSuggestionEffectProof,summary:Extract<SharedSuggestionEffectSummary,{kind:"verified"}>,closed:()=>void){this.#closed=closed;try{this.#summary=JSON.stringify(summary);proofs.set(this,{owner,raw});}catch(error){raw.free();throw error;}}
 summary():Extract<SharedSuggestionEffectSummary,{kind:"verified"}>{return JSON.parse(this.#summary) as Extract<SharedSuggestionEffectSummary,{kind:"verified"}>;}
 dispose():void{const entry=proofs.get(this);if(!entry)return;proofs.delete(this);entry.raw.free();this.#closed();}
}
/** @internal Native ownership/publication checks remain independently authoritative. */
export function nativeSuggestionEffectProof(owner:object,proof:SharedDocumentSuggestionEffectProof):SharedNativeSuggestionEffectProof {const entry=proofs.get(proof);if(!entry||entry.owner!==owner)throw Error("Suggestion effect proof is disposed or belongs to another editor");return entry.raw;}
