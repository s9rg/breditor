/** Coordinator-only intent family. It never widens original execute/selection/checkpoint DTOs. */
import type {RichDocumentCoreEditor,RichCommandOutcome} from "./core.js";
export type DocumentIntent=
 |{kind:"selectDocument"}
 |{kind:"collapseDocumentSelection";side:"before"|"after"}
 |{kind:"replaceDocumentPlainText";paragraph:string;text:string}
 |{kind:"replaceDocumentTypingText";paragraph:string;text:string;clockMs:string}
 |{kind:"pasteDocumentClipboard";clipboardJson:string;prefix:string};
export function isDocumentIntent(value:{kind:string}):value is DocumentIntent {
 return ["selectDocument","collapseDocumentSelection","replaceDocumentPlainText","replaceDocumentTypingText","pasteDocumentClipboard"].includes(value.kind);
}
export function publishDocumentIntent(core:RichDocumentCoreEditor,intent:DocumentIntent,revision:string):RichCommandOutcome {
 switch(intent.kind){
  case "selectDocument":return core.selectDocument(revision);
  case "collapseDocumentSelection":return core.collapseDocumentSelection(intent.side,revision);
  case "replaceDocumentPlainText":return core.replaceDocumentPlainText(intent.paragraph,intent.text,revision);
  case "replaceDocumentTypingText":return core.replaceDocumentTypingText(intent.paragraph,intent.text,intent.clockMs,revision);
  case "pasteDocumentClipboard":return core.pasteDocumentClipboard(intent.clipboardJson,intent.prefix,revision);
 }
}
