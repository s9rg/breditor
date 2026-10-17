import type {SharedSuggestionComposerAction} from "../types.js";
import {commands} from "./shared.js";
/** Same-flow source text intent. Protected cross-structure replacement requires an explicit
 * native general-range draft with its exact fresh floor identities, not a UI plain-text guess. */
export const replaceTextSuggestion:SharedSuggestionComposerAction={id:"replace-text",label:"Replace selected text",fields:[{id:"text",label:"Proposed text"}],enabled:c=>c.view.selection?.kind==="text",draft(c){const s=c.view.selection;if(s?.kind!=="text")throw Error("Select a text range or caret first");return commands([{kind:"replace_text_range",data:{anchor:s.anchor,focus:s.focus,runs:c.values["text"]?[{text:c.values["text"]!,formats:[]}]:[]}}]);}};
