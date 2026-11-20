import {id} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands,selectedProse} from "./shared.js";
import {richUiError} from "@breditor/experimental-rich-content/rendering";
/** Suggest rank changes for selected sibling prose, preserving their text and native identities. */
export const headingSuggestion:SharedSuggestionComposerAction={id:"heading",label:"Change heading",fields:[{id:"level",label:"Heading rank",initial:"2",choices:[{value:"0",label:"Paragraph"},...[1,2,3,4,5,6].map(n=>({value:String(n),label:`Heading ${n}`}))]}],enabled:c=>selectedProse(c).length>0,draft(c){const nodes=selectedProse(c),level=Number(c.values["level"]);if(!nodes.length||!Number.isInteger(level)||level<0||level>6)throw richUiError("suggestErrorHeading");return commands(nodes.map(node=>({kind:"set_heading",data:{block:id(node),level:level||null}})));}};
