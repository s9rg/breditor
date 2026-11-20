/** React owns only the borrowed shared AI/language panels; the shared session and its history stay owned elsewhere. */
import {mountSharedAiTools,mountSharedLanguageCheck,type SharedAiToolsSource} from "@breditor/collaboration";
import {aiToolsComponent,languageCheckComponent,type BreditorAiToolsPropsOf,type BreditorLanguageCheckPropsOf} from "./ai_tools_react.js";
export type {BreditorAiToolsHandle as BreditorSharedAiToolsHandle,BreditorLanguageCheckHandle as BreditorSharedLanguageCheckHandle} from "./ai_tools_react.js";
/** `editor` is a ready shared session (`SharedEditorSession` / `SharedDocumentEditorSession`, e.g. from `onReady`). */
export type BreditorSharedAiToolsProps=BreditorAiToolsPropsOf<SharedAiToolsSource>;
export type BreditorSharedLanguageCheckProps=BreditorLanguageCheckPropsOf<SharedAiToolsSource>;
/** Plain-text rewrite review for a shared session; retirement aborts the provider call, never the session. */
export const BreditorSharedAiTools=aiToolsComponent<SharedAiToolsSource>(mountSharedAiTools,"BreditorSharedAiTools");
/** Spelling/grammar review for a shared session; issues in blocks changed by peers are dropped. */
export const BreditorSharedLanguageCheck=languageCheckComponent<SharedAiToolsSource>(mountSharedLanguageCheck,"BreditorSharedLanguageCheck");
