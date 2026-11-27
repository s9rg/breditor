/**
 * Fixed EPUB 3.3 package parts. Every value interpolated here is either library-owned or already
 * validated and XML-escaped by the caller; no clock, randomness or environment value is read.
 */
export const epubContentType="application/epub+zip";
/** Package directory inside the OCF container. */
export const packageRoot="EPUB";
export const containerXml=`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${packageRoot}/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
/** Small bundled reading-system stylesheet (library-authored, no external resources). */
export const stylesheet=`@charset "UTF-8";
body{margin:0 4%;line-height:1.5}
h1,h2,h3,h4,h5,h6{line-height:1.25;break-after:avoid;page-break-after:avoid}
blockquote{margin:1em 0 1em 1em;padding-left:1em;border-left:3px solid #888}
pre{white-space:pre-wrap;font-family:monospace;background:#f3f3f3;padding:.5em}
code{font-family:monospace}
hr{border:0;border-top:1px solid #888}
table{border-collapse:collapse;margin:1em 0}
th,td{border:1px solid #888;padding:.25em .5em;vertical-align:top}
th{background:#eee}
caption{caption-side:bottom;font-size:.9em}
figure{margin:1em 0}
figcaption{font-size:.9em}
img{max-width:100%;height:auto}
nav#toc ol{list-style:none;padding-left:1em}
`;
export interface ManifestItem {readonly id:string;readonly href:string;readonly mediaType:string;readonly properties?:string}
export interface PackageMetadata {readonly title:string;readonly language:string;readonly identifier:string;readonly author:string|undefined;readonly modified:string}
/** `metadata` fields are XML-escaped text. */
export function packageXml(metadata:PackageMetadata,items:readonly ManifestItem[],spine:readonly string[]):string {
  const manifest=items.map(item=>`<item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${item.properties?` properties="${item.properties}"`:""}/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${metadata.language}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">${metadata.identifier}</dc:identifier><dc:title>${metadata.title}</dc:title><dc:language>${metadata.language}</dc:language>${metadata.author===undefined?"":`<dc:creator>${metadata.author}</dc:creator>`}<meta property="dcterms:modified">${metadata.modified}</meta></metadata><manifest>${manifest}</manifest><spine>${spine.map(id=>`<itemref idref="${id}"/>`).join("")}</spine></package>`;
}
/** One XHTML content document; `title` is escaped text, `body` well-formed XHTML. */
export function xhtmlDocument(title:string,language:string,body:string,nav=false):string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"${nav?' xmlns:epub="http://www.idpf.org/2007/ops"':""} lang="${language}" xml:lang="${language}"><head><meta charset="UTF-8"/><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
}
export interface NavEntry {readonly level:number;readonly href:string;readonly label:string}
/** Nested `ol` table of contents. A deeper heading nests under the nearest shallower one. */
export function navBody(title:string,entries:readonly NavEntry[]):string {
  interface Item {entry:NavEntry;children:Item[]}
  const root:Item[]=[],stack:Item[]=[];
  for(const entry of entries){
    while(stack.length&&stack.at(-1)!.entry.level>=entry.level)stack.pop();
    const item={entry,children:[]};(stack.at(-1)?.children??root).push(item);stack.push(item);
  }
  const list=(items:readonly Item[]):string=>`<ol>${items.map(item=>`<li><a href="${item.entry.href}">${item.entry.label}</a>${item.children.length?list(item.children):""}</li>`).join("")}</ol>`;
  return `<nav epub:type="toc" id="toc"><h1>${title}</h1>${list(root)}</nav>`;
}
