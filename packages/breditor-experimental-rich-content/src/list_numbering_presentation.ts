import {property,type ElementNode} from "./model.js";
/** Candidate rich V4 marker styles by native code 1–5 (CSS `list-style-type` keywords). */
export const listNumberStyles=["decimal","lower-alpha","upper-alpha","lower-roman","upper-roman"] as const;
/** The exact HTML `<ol type>` token for each native code 1–5. */
export const listNumberHtmlTypes=["1","a","A","i","I"] as const;
/** Validated admitted numbering of one ordered list; never arbitrary CSS or counter styles. */
export function listNumberingOf(node:ElementNode):{start:number;style:number|undefined;reversed:boolean}|undefined{
 const style=property(node,"list-style"),reversed=property(node,"list-reversed");
 if(node.type!=="breditor/ordered-list"){if(style!==undefined||reversed!==undefined)throw new TypeError("List numbering belongs only to ordered lists");return undefined;}
 if(style!==undefined&&(typeof style!=="number"||!Number.isInteger(style)||style<1||style>5))throw new TypeError("Invalid admitted list numbering style");
 if(reversed!==undefined&&reversed!==true)throw new TypeError("Invalid admitted list reversal");
 const start=property(node,"start");if(typeof start!=="number"||!Number.isSafeInteger(start)||start<1)throw new TypeError("Invalid admitted list start");
 return {start,style,reversed:reversed===true};
}
/** Closed presentation of native semantics: HTML `start`, `type` and `reversed` on one `<ol>`.
 * Each list carries only its own values, so nested lists never inherit a marker style. */
export function applyListNumbering(element:HTMLElement,node:ElementNode):void{
 const value=listNumberingOf(node);if(!value)return;
 element.setAttribute("start",String(value.start));
 if(value.style===undefined)element.removeAttribute("type");else element.setAttribute("type",listNumberHtmlTypes[value.style-1]!);
 element.toggleAttribute("reversed",value.reversed);
}
