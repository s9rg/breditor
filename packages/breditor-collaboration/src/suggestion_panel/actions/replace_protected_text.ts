import type {SharedSuggestionComposerAction} from "../types.js";
import {richUiError} from "@breditor/experimental-rich-content/rendering";
/** Native protected-range planning preserves partial tables/images and allocates only the exact
 * required floor identities. Host namespace reservation is permanent, including refusal/discard.
 * Older runtimes never fall back to same-flow edits or structural flattening. */
export const protectedTextSuggestion:SharedSuggestionComposerAction={id:"replace-protected-text",label:"Replace text across structures",fields:[{id:"text",label:"Proposed text"}],enabled:c=>c.view.selection?.kind==="text"&&!!c.planText,draft(c){if(!c.planText)throw richUiError("suggestErrorProtected");const prefix=c.allocate("suggestion-range");return c.planText(c.values["text"]?[{text:c.values["text"]!,formatsJson:"[]"}]:[],prefix);}};
