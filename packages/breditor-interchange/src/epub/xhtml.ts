/**
 * Library-owned semantic HTML to XHTML (XML serialization). The input is only ever the output of
 * `HtmlExport`: every tag and attribute is library-authored, text and attribute values are escaped
 * (`<`, `>` and `&` never appear raw), so a closed tag/attribute allowlist can rewrite it exactly:
 * void elements self-close, HTML boolean attributes get their XML form, and the obsolete
 * `<col width>` becomes an inline width. Anything outside the allowlist is an internal error.
 */
const voidTags=new Set(["col","hr","img","input"]);
const tags=new Set(["a","blockquote","caption","code","col","colgroup","details","div","em","figcaption","figure","h1","h2","h3","h4","h5","h6","hr","img","input","li","ol","p","pre","rp","rt","ruby","s","span","strong","sub","summary","sup","table","tbody","td","th","tr","u","ul"]);
const booleans=new Set(["checked","disabled","open","reversed"]);
const tag=/<(\/?)([a-z][a-z0-9]*)([^<>]*)>/g,attribute=/\s+([a-z][a-z0-9-]*)(?:="([^"<>]*)")?/y;
/** XML 1.0 excludes these characters even as references. */
export const invalidXmlCharacters=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
export function htmlToXhtml(html:string):string {
  if(/[<>]/.test(html.replace(tag,"")))throw new TypeError("Unexpected markup outside library-owned tags");
  return html.replace(tag,(_all,close:string,name:string,rest:string)=>{
    if(!tags.has(name))throw new TypeError(`Unexpected element ${name}`);
    if(close){if(rest)throw new TypeError("Attributes on an end tag");return `</${name}>`;}
    let out=`<${name}`,at=0;const seen=new Set<string>();
    while(at<rest.length){
      attribute.lastIndex=at;const m=attribute.exec(rest);if(!m)throw new TypeError(`Malformed attributes on ${name}`);
      at=attribute.lastIndex;const key=m[1]!,value=m[2];
      if(seen.has(key))throw new TypeError("Duplicate attribute");seen.add(key);
      if(value===undefined){if(!booleans.has(key))throw new TypeError(`Unexpected boolean attribute ${key}`);out+=` ${key}="${key}"`;}
      // HTML5 dropped `<col width>`; the native column width becomes an equivalent inline width.
      else if(name==="col"&&key==="width"){if(!/^[0-9]+$/.test(value))throw new TypeError("Bad column width");out+=` style="width:${value}px"`;}
      else out+=` ${key}="${value}"`;
    }
    return voidTags.has(name)?`${out}/>`:`${out}>`;
  });
}
/** Every `bm-` anchor id in one content document (bookmarks are exported as `id="bm-<name>"`). */
export function anchorIds(xhtml:string):string[] {
  return [...xhtml.matchAll(/\sid="(bm-[A-Za-z0-9_-]+)"/g)].map(m=>m[1]!);
}
/**
 * Point internal `#bm-<name>` links at the content document that holds the anchor. A link whose
 * anchor is in no document keeps its text and loses the link (counted by the caller as `unsafe-link`).
 */
export function resolveInternalLinks(xhtml:string,here:string,anchors:ReadonlyMap<string,string>):{xhtml:string;dangling:number} {
  let dangling=0;
  const out=xhtml.replace(/<a href="#(bm-[A-Za-z0-9_-]+)">([\s\S]*?)<\/a>/g,(_all,id:string,inner:string)=>{
    const file=anchors.get(id);
    if(file===undefined){dangling++;return inner;}
    return `<a href="${file===here?"":file}#${id}">${inner}</a>`;
  });
  return {xhtml:out,dangling};
}
