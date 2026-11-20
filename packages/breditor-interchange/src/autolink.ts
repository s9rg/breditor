import {isImageLinkHrefV1} from "./image_link_href.js";
/**
 * Candidate recognition of the native typed `autolink-v1` rule, mirrored for Markdown
 * import. This is a line-for-line copy of Rust `rich_content/input_rules/autolink.rs`
 * (`rich_autolink_candidate`; the Rust owner remains authoritative): the same openers,
 * trailing punctuation, unbalanced-bracket exclusion, `www.` → `https://www.` target, single
 * empty-path repair and the canonical `safeLinkV1` subset (`isImageLinkHrefV1`, the mirror of
 * Rust `image_link::is_canonical_href`). Offsets here are UTF-16 code units, not UTF-8 bytes.
 */
export interface AutolinkCandidate {readonly start:number;readonly end:number;readonly href:string}
/** Characters that may open a candidate inside a run without belonging to it. */
export const autolinkOpeners:ReadonlySet<string>=new Set(["(","[","{","<","\"","'"]);
/** Trailing characters that never end a URL (prose punctuation). */
export const autolinkTrailing:ReadonlySet<string>=new Set([".",",",":",";","!","?","'","\"","*","_","~",">"]);
const count=(value:string,c:string)=>value.split(c).length-1;
/** Recognize the candidate in one whitespace-free run (the run must contain no `White_Space`). */
export function autolinkRun(run:string):AutolinkCandidate|null {
  let start=0;
  while(start<run.length&&autolinkOpeners.has(run[start]!))start++;
  const rest=run.slice(start),www=rest.startsWith("www.");
  if(!(www||rest.startsWith("https://")||rest.startsWith("http://")))return null;
  let url=rest;
  for(;;){
    if(!url)return null;
    const last=url[url.length-1]!,unbalanced=(open:string,close:string)=>last===close&&count(url,open)<count(url,close);
    if(autolinkTrailing.has(last)||unbalanced("(",")")||unbalanced("[","]")||unbalanced("{","}"))url=url.slice(0,-1);else break;
  }
  // Stripping can never leave only a scheme or bare "www" prefix behind.
  const prefix=["https://","http://","www."].find(p=>url.startsWith(p));
  if(/[^\x00-\x7f]/.test(url)||prefix===undefined||url.length===prefix.length)return null;
  let href=www?`https://${url}`:url;
  // WHATWG serializes a special URL with an empty path as "/". This is the only repair.
  const scheme=href.indexOf("://")+3,found=href.slice(scheme).search(/[/?#]/),authority=found<0?href.length:scheme+found;
  if(href[authority]!=="/")href=`${href.slice(0,authority)}/${href.slice(authority)}`;
  return isImageLinkHrefV1(href)?{start,end:start+url.length,href}:null;
}
/** Rust `rich_autolink_candidate`: the candidate that ends exactly at the end of `text`. */
export function autolinkCandidate(text:string):AutolinkCandidate|null {
  const run=/[^\p{White_Space}]*$/u.exec(text)![0];
  const found=autolinkRun(run);if(!found)return null;
  const offset=text.length-run.length;return{start:found.start+offset,end:found.end+offset,href:found.href};
}
