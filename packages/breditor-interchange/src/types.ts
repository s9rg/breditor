/** Explicit conversion only: these values never grant edit, storage or network authority. */
export interface ClipboardTransfer {
  readonly format:"breditor/rich-clipboard-transfer";
  readonly formatVersion:1;
  readonly kind:"text"|"flow"|"grid";
  readonly structuredJson:string;
  readonly plainText:string;
}
/** Both local and shared native facades implement this structural, independently versioned boundary. */
export interface InterchangeOwner {
  supportsClipboardInterchange?():boolean;
  admitClipboardRoot?(kind:"text"|"flow"|"grid",rootJson:string):ClipboardTransfer;
  validateClipboard?(clipboardJson:string):ClipboardTransfer;
  /** Candidate rich V4 owners admit ordered-list marker style and reversal. Absent or false keeps
   * the original conversion: those HTML features are reported as `list-numbering` losses. */
  supportsListNumbering?():boolean;
  /** Candidate rich V4 owners admit the native `breditor/text-language` inline format. Absent or
   * false keeps the original conversion: `lang`/`xml:lang` are accepted and silently dropped. */
  supportsTextLanguage?():boolean;
  /** Candidate rich V4 owners admit image links (`breditor/image-href`). Absent or false keeps the
   * original conversion: an `<a href>` around an `<img>` is dropped (an unsafe href still reports
   * `unsafe-link`), and `<figure><a><img></a></figure>` falls back with `block-structure`. */
  supportsImageLinks?():boolean;
  /** Candidate rich V4 owners admit collapsible sections (`breditor/details`). Absent or false keeps
   * the original conversion: `<details>`/`<summary>` are unwrapped into ordinary flow. */
  supportsDetails?():boolean;
}
export type InterchangeLossCode = "html-repaired"|"removed-content"|"unsupported-element"|"unsupported-attribute"|"unsupported-style"|"style-approximation"|"unsafe-link"|"image-reference"|"image-alt"|"image-size"|"block-structure"|"table-geometry"|"table-width"|"list-numbering"|"markdown-feature";
/** Counts are aggregated and bounded. No source text, URL, CSS, HTML or asset identifier is echoed. */
export interface InterchangeLoss {readonly code:InterchangeLossCode;readonly count:number;readonly effect:"loss"|"compatibility"}
export type InterchangeErrorCode="invalid-source"|"resource-limit"|"empty"|"unsupported-content"|"malformed-table"|"asset-policy"|"native-admission";
export type InterchangeResult<T>=Readonly<{ok:true;value:T;losses:readonly InterchangeLoss[]}>|Readonly<{ok:false;error:InterchangeErrorCode;losses:readonly InterchangeLoss[]}>;
/** Resolving a source reference means the host already owns these immutable bytes. */
export interface ImportedAsset {readonly asset:string;readonly generation:string}
export interface ImageSource {readonly src:string;readonly alt:string|null}
export interface InterchangeOptions {
  /** Synchronous host registry lookup only. The library never fetches or decodes source URLs. */
  readonly resolveImage?:(source:ImageSource)=>ImportedAsset|undefined;
  /** Portable absolute HTTP(S) URL for host-owned bytes. Missing/unsafe references become reported text. */
  readonly exportImage?:(asset:ImportedAsset)=>string|undefined;
}
/** Explicit host target policy; native kind/shape admission still decides whether it is valid. */
export interface InterchangeImportOptions {readonly kind?:"auto"|"flow"|"grid"}
export interface RichInterchange {
  importHtml(source:string,options?:InterchangeImportOptions):InterchangeResult<ClipboardTransfer>;
  importMarkdown(source:string,options?:InterchangeImportOptions):InterchangeResult<ClipboardTransfer>;
  exportHtml(clipboardJson:string):InterchangeResult<string>;
  exportMarkdown(clipboardJson:string):InterchangeResult<string>;
}
