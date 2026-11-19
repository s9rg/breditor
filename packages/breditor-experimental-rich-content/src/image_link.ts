/** Candidate rich V4 image links: read, intent encoding, inert editing render and toolbar controls. */
import {canonicalImageLinkHrefV1,imageLinkRenderAttributesV1,isImageLinkHrefV1} from "@breditor/browser/presentation";
import type {RichImageLinkIntent,RichSelectionPolicy} from "./core.js";
import {property,selectedImage,type ElementNode,type RichPresentationModel} from "./model.js";
import type {ActionContext} from "./actions.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";

/** Native V4 AST properties of `breditor/image` (Rust `image_link.rs`). */
export const richImageHrefProperty="breditor/image-href";
export const richImageLinkNewWindowProperty="breditor/image-link-new-window";

/** One admitted image link. */
export interface RichImageLinkRead {readonly href:string;readonly newWindow:boolean}

/** The exact admitted link of one image node, or `undefined` when it is not linked. */
export function imageLinkOf(node:ElementNode):RichImageLinkRead|undefined{
 if(node.type!=="breditor/image")return undefined;
 const href=property(node,"image-href");
 return isImageLinkHrefV1(href)?Object.freeze({href,newWindow:property(node,"image-link-new-window")===true}):undefined;
}
/** Canonical admitted target for user input, or `null` (Rust admission stays authoritative). */
export function canonicalImageLinkHref(value:unknown):string|null{return canonicalImageLinkHrefV1(value);}

/**
 * Wrap one rendered `<img>` in the link's `<a>`, using the inline `safeLinkV1` attribute set
 * (`href`, plus `rel="noopener noreferrer"` and `target="_blank"` for a new window). The link
 * wraps the image only, never its caption. An unlinked or non-canonical value leaves the image
 * unwrapped. Live editing keeps the anchor inert (see `applyEditingPolicy`).
 */
export function wrapImageLink(bitmap:HTMLImageElement,node:ElementNode):HTMLElement{
 const link=imageLinkOf(node);if(!link)return bitmap;
 const attributes=imageLinkRenderAttributesV1(link.href,link.newWindow);
 if(attributes[0]?.name!=="href"||attributes[0].value!==link.href)return bitmap;
 const anchor=bitmap.ownerDocument.createElement("a");anchor.dataset["richImageLink"]="";anchor.className="breditor-image-link";anchor.draggable=false;
 for(const attribute of attributes)anchor.setAttribute(attribute.name,attribute.value);
 anchor.append(bitmap);return anchor;
}

/** Snapshot only primitive intent before JSON; the canonical target is decided again by Rust. */
export function encodeImageLinkIntent(input:unknown):RichImageLinkIntent{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError("Expected plain image link intent");
 const record=input as Record<string,unknown>,keys=Reflect.ownKeys(input);
 if(keys.some(key=>typeof key!=="string"||!["image","href","newWindow"].includes(key))||!keys.includes("image")||!keys.includes("href"))throw new TypeError("Image link intent has image, href and optional newWindow fields");
 const image=record["image"],href=record["href"],newWindow=record["newWindow"];
 if(typeof image!=="string")throw new TypeError("Image link target must be an image identity string");
 if(href!==null&&typeof href!=="string")throw new TypeError("Image link href must be a primitive string or null");
 if(newWindow!==undefined&&typeof newWindow!=="boolean")throw new TypeError("Image link newWindow must be Boolean");
 if(href===null&&newWindow!==undefined)throw new TypeError("Clearing an image link takes no newWindow");
 return newWindow===undefined?{image,href}:{image,href,newWindow};
}

interface ImageLinkReader {richLanguageVersion?():1|2|3|4;supportsImageLinks?():boolean}
export interface ImageLinkControl {
 readonly id:string;readonly label:string;readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 read(model:RichPresentationModel):RichToolbarReading;
 enabled(model:RichPresentationModel):boolean;
 /** Intent only, or `null` for an exact no-op. */
 intent(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RichImageLinkIntent|null;
}
/**
 * Owner-bound DOM-free V4 controls shown for a selected image (the image node, or a caret in its
 * caption, exactly like the existing image alt/caption controls): **Image link** (a URL field
 * canonicalized by the inline link policy plus the same "Link opens in" choice as the inline
 * Link control) and **Remove image link**. Decorative images cannot be linked: the control
 * explains that a link needs alternative text instead of sending a refused command.
 */
export function imageLinkControls(core:ImageLinkReader):readonly ImageLinkControl[]{
 if(core.richLanguageVersion?.()!==4||core.supportsImageLinks?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const image=(model:RichPresentationModel)=>selectedImage(model);
 return Object.freeze([
  Object.freeze({id:"image-link",label:"Image link",fields:Object.freeze([
   {id:"href",label:"Image link URL",type:"text",maxLength:2048,placeholder:"https://…"},
   {id:"target",label:"Link opens in",type:"select",options:[{value:"same",label:"Same window"},{value:"new",label:"New window"}]},
  ] satisfies RichToolbarField[]),mixedHint:"The link wraps the selected image only, not its caption.",
  read(model:RichPresentationModel):RichToolbarReading{
   const node=image(model);if(!node)return {kind:"unavailable"};
   const link=imageLinkOf(node);
   return link?{kind:"uniform",values:{href:link.href,target:link.newWindow?"new":"same"}}:{kind:"unset",values:{href:"",target:"same"}};
  },
  enabled(model:RichPresentationModel):boolean{return image(model)!==undefined;},
  intent(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RichImageLinkIntent|null{
   const node=image(model);if(!node)return null;
   if(property(node,"decorative")===true)throw Error("A decorative image cannot be a link. Describe the image first: its alternative text names the link");
   const input=(fields["href"]??"").trim(),target=fields["target"]||"same";
   if(target!=="same"&&target!=="new")throw new TypeError("Unknown link target");
   const current=imageLinkOf(node);
   if(!input){if(!current)throw Error("Enter an image link URL, or use Remove image link");}
   const href=input?canonicalImageLinkHref(input):current!.href;
   if(href===null)throw Error("Enter an absolute HTTP(S) URL without credentials or whitespace");
   const newWindow=target==="new";
   if(current&&current.href===href&&current.newWindow===newWindow)return null;
   const imageId=String(property(node,"image-id"));
   return newWindow?{image:imageId,href,newWindow:true}:{image:imageId,href};
  }}),
  Object.freeze({id:"reset-image-link",label:"Remove image link",
  read(model:RichPresentationModel):RichToolbarReading{const node=image(model);return node?{kind:imageLinkOf(node)?"uniform":"unset"}:{kind:"unavailable"};},
  enabled(model:RichPresentationModel):boolean{const node=image(model);return node!==undefined&&imageLinkOf(node)!==undefined;},
  intent(model:RichPresentationModel):RichImageLinkIntent|null{const node=image(model);return node&&imageLinkOf(node)?{image:String(property(node,"image-id")),href:null}:null;}}),
 ]);
}
/** Toolbar adapters: native `setImageLink` commands only, bound to the owner they were built for. */
export function imageLinkToolbarControls<P extends RichSelectionPolicy>(core:ImageLinkReader&object){
 return imageLinkControls(core).map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:(c:ActionContext<P>)=>spec.read(c.model),
  enabled:(c:ActionContext<P>)=>spec.enabled(c.model),
  command(c:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){if(c.core!==core)throw Error("Image link control belongs to a different Rust owner");const data=spec.intent(c.model,fields);return data?{kind:"setImageLink" as const,data}:null;}}));
}
