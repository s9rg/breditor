/**
 * Server-renderable inert document view. Pure: no effects, refs, state or editor owner,
 * so `renderToString`, streaming SSR and React Server Components can all render it.
 * The markup is produced by `renderStaticDocument`, which validates and escapes every
 * value; the component only places that markup inside the shared surface wrapper.
 */
import type {ReactElement} from "react";
import {staticSurfaceClass,type StaticRenderOptions} from "./static_document.js";
import {renderStaticDocumentTrustedContents} from "./static_trusted_html.js";

export interface BreditorStaticDocumentProps {
 /** Canonical document JSON string or parsed object (for example `editor.view().documentJson`). */
 document:unknown;
 /** Synchronous asset lookup, unknown-content policy, id hooks and limits. `fragment` is fixed by the component. */
 options?:Omit<StaticRenderOptions,"fragment">;
 /** Appended to the shared `breditor-rich-surface` class. */
 className?:string;
}

/** Validation errors throw during render, so a surrounding error boundary or SSR handler decides the fallback. */
export function BreditorStaticDocument({document,options,className}:BreditorStaticDocumentProps):ReactElement {
 // TrustedHTML under an enforcing Trusted Types policy (allowlist `breditor-static-html`), else the string.
 const html=renderStaticDocumentTrustedContents(document,options);
 return <div className={className?`${staticSurfaceClass} ${className}`:staticSurfaceClass} data-breditor-rich="" data-breditor-static="" dangerouslySetInnerHTML={{__html:html}}/>;
}
