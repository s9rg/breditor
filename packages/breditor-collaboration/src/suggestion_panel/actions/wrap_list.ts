import {id} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands,selectedProse} from "./shared.js";
import {richUiError} from "@breditor/experimental-rich-content/rendering";
/** Native list wrapping with host-allocated fresh wrapper/item IDs. Unsupported placement is a
 * native admission error, never a silent flattening or accepted document replacement. */
export const listSuggestion:SharedSuggestionComposerAction={id:"list",label:"Wrap a list",fields:[{id:"style",label:"List style",initial:"bullet",choices:[{value:"bullet",label:"Bullet"},{value:"ordered",label:"Numbered"}]}],enabled:c=>selectedProse(c).length>0,draft(c){const nodes=selectedProse(c);if(!nodes.length)throw richUiError("suggestErrorList");return commands([{kind:"wrap_list",data:{first:id(nodes[0]!),last:id(nodes.at(-1)!),container:c.allocate("list"),items:nodes.map(()=>c.allocate("item")),style:c.values["style"]==="ordered"?{kind:"ordered",start:1}:{kind:"bullet"}}}]);}};
