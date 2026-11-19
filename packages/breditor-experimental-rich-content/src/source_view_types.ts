/**
 * Opt-in HTML source view contract. Source text is a bounded conversion input, never trusted editor state:
 * it is imported only through the explicit interchange adapter and Rust clipboard admission, and applied as
 * one guarded whole-document rich paste. See docs/HTML_SOURCE_VIEW.md.
 */
import type {RichInterchangeNotice} from "./clipboard_interchange.js";
import type {RichCommandOutcome} from "./core.js";
/** Same UTF-8 ceiling as the interchange adapter's source budget and the clipboard string budget. */
export const RICH_DOCUMENT_SOURCE_MAX_BYTES=1024*1024;
export interface RichDocumentSourceHostState {
 readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean;
 /** False when the editor was mounted without an explicit clipboard interchange adapter. */
 readonly available:boolean;
}
/** One detached export of the whole document at `revision`. It carries no mutation authority. */
export interface RichDocumentSourceRead {
 readonly format:"breditor/document-source";readonly formatVersion:1;
 readonly revision:string;readonly readOnly:boolean;
 /** Sanitized semantic HTML from the adapter's export. Display it as text only (for example a textarea value). */
 readonly html:string;
 /** What the export could not represent; applying any source drops these from the document. */
 readonly losses:readonly RichInterchangeNotice[];
}
/** Import report prepared before any mutation. Only a preview issued by the same host can be applied, once. */
export interface RichDocumentSourcePreview {
 readonly format:"breditor/document-source-preview";readonly formatVersion:1;
 readonly revision:string;
 /** The source text is byte-identical to the export; applying is a no-op. */
 readonly unchanged:boolean;
 /** False when the bounded import or native admission refused the source. Nothing can be applied. */
 readonly applicable:boolean;
 /** Interchange error code when not applicable (for example "resource-limit"); never echoes source text. */
 readonly error:string|null;
 readonly bytes:number;
 readonly kind:"text"|"flow"|"grid"|null;
 /** Import losses: removed scripts/styles/handlers, unsupported elements, attributes and CSS, unsafe links… */
 readonly losses:readonly RichInterchangeNotice[];
 /** Export losses from the read this preview was made against. */
 readonly exportLosses:readonly RichInterchangeNotice[];
}
/** Implemented by the explicit document-selection DOM coordinator (`RichDomEditor<"document-v1">.documentSource()`). */
export interface RichDocumentSourceHost {
 readonly surface:HTMLElement;
 sourceState():RichDocumentSourceHostState;
 /** Presentation notifications after publication, policy or disposal changes. Listeners must not publish. */
 subscribeSource(listener:()=>void):()=>void;
 /**
  * Selects the whole document (a selection-only publication when it was not already selected) and exports it.
  * The returned revision is the guard for every later preview and apply.
  */
 readDocumentSource():RichDocumentSourceRead;
 /** Import `source` through the bounded adapter and native admission without mutating the document. */
 previewDocumentSource(source:string,read:RichDocumentSourceRead):RichDocumentSourcePreview;
 /** One guarded whole-document rich paste (one Undo step). Refuses stale, read-only, foreign or reused previews. */
 applyDocumentSource(preview:RichDocumentSourcePreview):RichCommandOutcome|"queued";
}
