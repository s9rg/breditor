/** Candidate rich V4 bookmarks and internal links: grammar mirror, presentation attributes shared by
 * the live and static renderers, intent encoding and owner-bound toolbar controls. Rust
 * (`rich_content/bookmark.rs`) owns admission, uniqueness, rename and history. */
import type {FormatLiteral,RichCoreEditor,RichSelectionPolicy} from "./core.js";
import type {RichCommand} from "./commands.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import {id,property,textTargets,type AstNode,type ElementNode,type RichPresentationModel} from "./model.js";
import type {RichToolbarReading} from "./toolbar_control_view.js";

/** AST property (`breditor/bookmark`) of the optional bookmark name on a paragraph, heading or code block. */
export const richBookmarkProperty="breditor/bookmark";
/** Inclusive byte (= character, ASCII) ceiling of one name. */
export const richBookmarkNameMaxLength=64;
/** Prefix of every rendered bookmark element id and fragment (`bm-` + name), so bookmark ids
 * never collide with host ids. */
export const richBookmarkIdPrefix="bm-";
const namePattern=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bookmarkKinds=new Set(["breditor/paragraph","breditor/heading","breditor/code-block"]);
const linkKind="breditor-inline/link",hrefProperty="breditor-inline/href",newWindowProperty="breditor-inline/new-window";

/** Exact mirror of Rust `is_valid_name`: `[A-Za-z][A-Za-z0-9_-]{0,63}`, case-sensitive, never repaired. */
export function isBookmarkName(value:unknown):value is string{return typeof value==="string"&&namePattern.test(value);}
/** The bookmark name of an internal link href (`#` + name), or `undefined` for any other href. */
export function internalLinkName(href:unknown):string|undefined{
 return typeof href==="string"&&href.startsWith("#")&&isBookmarkName(href.slice(1))?href.slice(1):undefined;
}
/** The internal target name of a standard link literal (same window only), or `undefined`. */
export function internalLinkOf(format:FormatLiteral):string|undefined{
 if(format.type!==linkKind||format.properties[newWindowProperty]!==false)return undefined;
 return internalLinkName(format.properties[hrefProperty]);
}
/** The admitted bookmark name of a text block, or `undefined`. */
export function bookmarkOf(node:ElementNode):string|undefined{
 if(!bookmarkKinds.has(node.type))return undefined;
 const value=property(node,"bookmark");return isBookmarkName(value)?value:undefined;
}
export const bookmarkElementId=(name:string):string=>`${richBookmarkIdPrefix}${name}`;
export interface RichAttribute {readonly name:string;readonly value:string}
/** Attributes of a bookmarked block in live and static output: a prefixed `id` and `data-rich-bookmark`. */
export function bookmarkAttributes(name:string):readonly RichAttribute[]{
 return Object.freeze([{name:"id",value:bookmarkElementId(name)},{name:"data-rich-bookmark",value:name}]);
}
/** Attributes added to an internal link's `<a>`. A resolved link points at `#bm-<name>`; a dangling
 * one has no `href` and carries `data-rich-link-broken`. */
export function internalLinkAttributes(name:string,resolved:boolean):readonly RichAttribute[]{
 return Object.freeze(resolved?[{name:"href",value:`#${bookmarkElementId(name)}`},{name:"data-rich-internal-link",value:name}]:[{name:"data-rich-internal-link",value:name},{name:"data-rich-link-broken",value:""}]);
}
/** Every bookmark name of one admitted tree, in document order. */
export function bookmarkNames(root:ElementNode):readonly string[]{
 const names:string[]=[];
 const visit=(node:AstNode):void=>{if(node.kind!=="element")return;const name=bookmarkOf(node);if(name!==undefined)names.push(name);for(const child of node.children)visit(child);};
 visit(root);return names;
}
/** Optional host CSS: dangling internal links are visibly marked. */
export const richBookmarkStyles=`[data-breditor-rich] a[data-rich-link-broken]{text-decoration:underline wavy #b3261e;cursor:not-allowed}`;

/** Inventory read from `bookmarkIndexJson()` (document order). */
export interface RichBookmarkIndex {
 readonly bookmarks:readonly {readonly name:string;readonly block:string}[];
 readonly links:readonly {readonly block:string;readonly target:string}[];
 readonly brokenLinks:readonly {readonly block:string;readonly target:string}[];
}
export type RichSetBookmarkIntent={block:string;name:string|null};
export type RichRenameBookmarkIntent={from:string;to:string};

function plain(input:unknown,keys:readonly string[],what:string):Record<string,unknown>{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError(`Expected plain ${what} intent`);
 const own=Reflect.ownKeys(input);
 if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key)))throw new TypeError(`${what} intent has exactly the fields ${keys.join(", ")}`);
 return input as Record<string,unknown>;
}
/** Snapshot primitive `setBookmark` intent before JSON; Rust decides admission and uniqueness. */
export function encodeSetBookmarkIntent(input:unknown):RichSetBookmarkIntent{
 const record=plain(input,["block","name"],"Bookmark"),block=record["block"],name=record["name"];
 if(typeof block!=="string")throw new TypeError("Bookmark block must be a block identity string");
 if(name!==null&&typeof name!=="string")throw new TypeError("Bookmark name must be a primitive string or null");
 return {block,name};
}
/** Snapshot primitive `renameBookmark` intent before JSON. */
export function encodeRenameBookmarkIntent(input:unknown):RichRenameBookmarkIntent{
 const record=plain(input,["from","to"],"Bookmark rename"),from=record["from"],to=record["to"];
 if(typeof from!=="string"||typeof to!=="string")throw new TypeError("Bookmark rename names must be primitive strings");
 return {from,to};
}

type BookmarkOwner={richLanguageVersion?():number;supportsBookmarks?():boolean;supportsSelectionFormatting?():boolean};
/** The one paragraph, heading or code block holding the whole text selection. */
export function bookmarkTarget(model:RichPresentationModel):ElementNode|undefined{
 const s=model.view.selection;if(s?.kind!=="text"||s.anchor.block!==s.focus.block)return undefined;
 const node=model.nodes.get(s.focus.block);return node&&bookmarkKinds.has(node.type)?node:undefined;
}
/** Validate a typed name against the grammar and the other blocks of the document. */
export function checkBookmarkName(model:RichPresentationModel,block:ElementNode,input:string):string{
 if(!isBookmarkName(input))throw Error("A bookmark name starts with a letter and uses at most 64 letters, digits, hyphens or underscores");
 const current=bookmarkOf(block);
 if(input!==current&&bookmarkNames(model.root).includes(input))throw Error("Another block already uses this bookmark name");
 return input;
}
/** Link literal for an internal target: same window only. */
export function internalLinkFormat(name:string):FormatLiteral{
 if(!isBookmarkName(name))throw Error("Choose an existing bookmark");
 return {type:linkKind,properties:{[hrefProperty]:`#${name}`,[newWindowProperty]:false}};
}
/**
 * V4 controls: **Bookmark** (name field; sets a new bookmark with `setBookmark`, or renames the
 * block's existing one with `renameBookmark`, which retargets every internal link in the same Undo
 * step), **Remove bookmark** (`setBookmark` with `null`; links to it become dangling and are marked)
 * and **Link to bookmark** (the link control's internal-target choice: a select listing the document's
 * bookmarks, applied to the selected text as a same-window link `#name`).
 */
export function bookmarkToolbarControls<P extends RichSelectionPolicy>(core:RichCoreEditor<P>&BookmarkOwner):readonly ToolbarControl<P>[]{
 if(core.richLanguageVersion?.()!==4||core.supportsBookmarks?.()!==true)throw Error("Use an explicitly selected matching rich V4 owner");
 const bound=(c:ActionContext<P>):void=>{if(c.core!==core)throw Error("Bookmark control belongs to a different Rust owner");};
 const linkable=(model:RichPresentationModel):boolean=>{const s=model.view.selection;return s?.kind==="text"&&textTargets(model).length>0&&bookmarkNames(model.root).length>0;};
 return Object.freeze([
  {id:"bookmark",label:"Bookmark",owner:core,mixedHint:"Renaming a bookmark updates every link to it.",
   fields:[{id:"name",label:"Bookmark name",type:"text",maxLength:richBookmarkNameMaxLength,placeholder:"section-name"}],
   read:(c:ActionContext<P>):RichToolbarReading=>{const node=bookmarkTarget(c.model);if(!node)return {kind:"unavailable"};const name=bookmarkOf(node);return name?{kind:"uniform",values:{name}}:{kind:"unset",values:{name:""}};},
   enabled:c=>bookmarkTarget(c.model)!==undefined,
   command:(c,_value,fields={}):RichCommand|null=>{
    bound(c);const node=bookmarkTarget(c.model);if(!node)return null;
    const input=(fields["name"]??"").trim();if(!input)throw Error("Enter a bookmark name, or use Remove bookmark");
    const name=checkBookmarkName(c.model,node,input),current=bookmarkOf(node);
    if(current===name)return null;
    return current?{kind:"renameBookmark",data:{from:current,to:name}}:{kind:"setBookmark",data:{block:id(node),name}};
   }},
  {id:"remove-bookmark",label:"Remove bookmark",owner:core,
   read:c=>{const node=bookmarkTarget(c.model);return node?{kind:bookmarkOf(node)?"uniform":"unset"}:{kind:"unavailable"};},
   enabled:c=>{const node=bookmarkTarget(c.model);return node!==undefined&&bookmarkOf(node)!==undefined;},
   command:c=>{bound(c);const node=bookmarkTarget(c.model);return node&&bookmarkOf(node)?{kind:"setBookmark",data:{block:id(node),name:null}}:null;}},
  {id:"link-bookmark",label:"Link to bookmark",owner:core,mixedHint:"Links the selected text to a bookmark in this document.",
   fields:[{id:"target",label:"Bookmark",type:"select",options:[]}],
   read:(c:ActionContext<P>):RichToolbarReading=>{
    if(!linkable(c.model))return {kind:"unavailable"};
    return {kind:"unset",values:{target:""},options:{target:bookmarkNames(c.model.root).map(name=>({value:name,label:name}))}};
   },
   enabled:c=>linkable(c.model),
   command:(c,_value,fields={}):RichCommand|null=>{
    bound(c);const target=fields["target"]??"";
    if(!bookmarkNames(c.model.root).includes(target))throw Error("Choose an existing bookmark");
    const formatsJson=JSON.stringify([internalLinkFormat(target)]);
    if(core.supportsSelectionFormatting?.()===true)return {kind:"changeSelectionFormats",data:{changes:[{kind:"set",formatsJson}]}} as RichCommand;
    const targets=textTargets(c.model);return targets.length?{kind:"changeInlineFormats",data:{changes:[{kind:"set",formatsJson}],targets}}:null;
   }},
 ] satisfies ToolbarControl<P>[]);
}
