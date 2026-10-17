import {presentationModel,id,isProse,type ElementNode} from "@breditor/experimental-rich-content/rendering";
import type {SharedEditorView,SharedSelectionPolicy} from "../../types.js";
import type {SharedSuggestionComposerContext} from "../types.js";
import type {SharedDocumentSuggestionDraft} from "../../suggestion_types.js";
export function proposalModel(view:SharedEditorView<SharedSelectionPolicy>){return view.format==="breditor/shared-document-view"?presentationModel({...view,format:"breditor/rich-document-view"},"document-v1"):presentationModel({...view,format:"breditor/rich-view"},"original");}
type Commands=Extract<Extract<SharedDocumentSuggestionDraft,{scope:"commands"}>["edit"],{kind:"commands"}>["data"];
export const commands=(data:Commands):SharedDocumentSuggestionDraft=>({scope:"commands",edit:{kind:"commands",data}});
export function selectedProse(c:SharedSuggestionComposerContext):ElementNode[]{const s=c.view.selection;if(s?.kind!=="text")return [];const a=c.model.nodes.get(s.anchor.block),b=c.model.nodes.get(s.focus.block);if(!a||!b||!isProse(a)||!isProse(b))return [];const parent=c.model.parents.get(id(a));if(!parent||parent!==c.model.parents.get(id(b)))return [];const ai=parent.children.indexOf(a),bi=parent.children.indexOf(b);const nodes=parent.children.slice(Math.min(ai,bi),Math.max(ai,bi)+1);return nodes.every(n=>n.kind==="element"&&isProse(n))?nodes as ElementNode[]:[];}
