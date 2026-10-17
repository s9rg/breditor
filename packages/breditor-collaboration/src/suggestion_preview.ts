import type {SharedNativeSuggestionPreparation,SharedSuggestionPreviewSummary} from "./suggestion_types.js";
const previews=new WeakMap<SharedDocumentSuggestionPreview,{owner:object;raw:SharedNativeSuggestionPreparation;id:string}>();
/** Opaque native source-checked preview. It is not an accepted edit or a transferable permission. */
export class SharedDocumentSuggestionPreview {
 readonly #document:string;readonly #summary:string;readonly #closed:()=>void;
 /** @internal Use SharedRichEditor.prepareSuggestion. Native source/owner checks remain authoritative. */
 constructor(owner:object,raw:SharedNativeSuggestionPreparation,summary:SharedSuggestionPreviewSummary,closed:()=>void){this.#closed=closed;try{this.#document=raw.document_json();this.#summary=JSON.stringify(summary);previews.set(this,{owner,raw,id:summary.suggestion.id});}catch(error){raw.free();throw error;}}
 documentJson():string{return this.#document;}
 summary():SharedSuggestionPreviewSummary{return JSON.parse(this.#summary) as SharedSuggestionPreviewSummary;}
 /** Frozen read values remain readable; disposed native proof cannot be checked or reused. */
 dispose():void{const entry=previews.get(this);if(!entry)return;previews.delete(this);entry.raw.free();this.#closed();}
}
/** @internal Exact facade ownership complements the independently enforced native guard. */
export function nativeSuggestionPreview(owner:object,preview:SharedDocumentSuggestionPreview):{raw:SharedNativeSuggestionPreparation;id:string}{const entry=previews.get(preview);if(!entry||entry.owner!==owner)throw Error("Suggestion preview is disposed or belongs to another editor");return {raw:entry.raw,id:entry.id};}
