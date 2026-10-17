import type {SharedReviewGuard} from "../review_types.js";
export function button(document:Document,text:string,action:()=>void):HTMLButtonElement {
 const result=document.createElement("button");result.type="button";result.textContent=text;result.onclick=action;return result;
}
export function field(document:Document,name:string,rows=2):{label:HTMLLabelElement;input:HTMLTextAreaElement} {
 const label=document.createElement("label"),input=document.createElement("textarea");
 label.append(document.createTextNode(name),input);input.rows=rows;return {label,input};
}
export function sameGuard(a:SharedReviewGuard,b:SharedReviewGuard):boolean {
 return a.owner===b.owner&&a.documentRevision===b.documentRevision&&a.reviewRevision===b.reviewRevision;
}
export function idKey(id:{actor:string;counter:string}):string{return JSON.stringify([id.actor,id.counter]);}
