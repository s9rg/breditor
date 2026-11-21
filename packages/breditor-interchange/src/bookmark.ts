/**
 * Rich V4 bookmarks and internal links (Rust `rich_content/bookmark.rs`). This package has
 * no runtime dependency, so the grammar is an identical copy of `@breditor/experimental-rich-content`'s
 * `bookmark.ts` checks (a parity test compares them). Native admission stays authoritative.
 *
 * HTML shape: a bookmarked paragraph, heading or code block carries `id="bm-<name>"`; an internal
 * link is `<a href="#bm-<name>">`. Import accepts the same shapes plus foreign anchors: an `id` on
 * `<p>`/`<h1>`–`<h6>`/`<pre>` or an `<a name|id>` inside one, and `href="#<name>"`. A `bm-` prefix is
 * removed on both sides, so ids and fragments always map to the same bookmark name.
 */
import type {Literal,Node} from "./wire.js";

export const bookmarkProperty="breditor/bookmark";
export const bookmarkIdPrefix="bm-";
const namePattern=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const linkKind="breditor-inline/link",hrefProperty="breditor-inline/href",newWindowProperty="breditor-inline/new-window";
/** Exact copy of the native name grammar: `[A-Za-z][A-Za-z0-9_-]{0,63}`, case-sensitive. */
export function isBookmarkName(value:unknown):value is string{return typeof value==="string"&&namePattern.test(value);}
/** Bookmark name of one HTML anchor id or fragment (without `#`); the `bm-` prefix is removed. */
export function anchorName(raw:string):string|undefined{
 const value=raw.startsWith(bookmarkIdPrefix)&&isBookmarkName(raw.slice(bookmarkIdPrefix.length))?raw.slice(bookmarkIdPrefix.length):raw;
 return isBookmarkName(value)?value:undefined;
}
/** The internal target of an admitted same-window link literal `#name`, or `undefined`. */
export function internalLinkOf(format:Literal):string|undefined{
 if(format.type!==linkKind||format.properties[newWindowProperty]!==false)return undefined;
 const href=format.properties[hrefProperty];
 return typeof href==="string"&&href.startsWith("#")&&isBookmarkName(href.slice(1))?href.slice(1):undefined;
}
/** Link literal of one internal target. */
export function internalLinkFormat(name:string):Literal{return {type:linkKind,properties:{[hrefProperty]:`#${name}`,[newWindowProperty]:false}};}
/** Whether any text run below these nodes carries an internal link. */
export function hasInternalLink(nodes:readonly Node[]):boolean{
 return nodes.some(node=>node.kind==="text"?node.formats.some(format=>internalLinkOf(format)!==undefined):hasInternalLink(node.children));
}
