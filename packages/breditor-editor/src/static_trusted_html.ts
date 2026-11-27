/**
 * The one Trusted Types policy owned by the editor packages.
 *
 * Live editing, paste (a parse5 tree, never a live DOM parse), undo, images, the source view and
 * collaboration build DOM through `createElement`/`textContent` only, so they need no policy at
 * all. The static renderer is the exception: it returns an escaped HTML string that a host
 * inserts. Under `require-trusted-types-for 'script'` that insertion needs a `TrustedHTML`
 * value, which this module produces from renderer output only. The policy object is private, so
 * the host allowlist entry `trusted-types breditor-static-html` admits no other strings.
 * See docs/CONTENT_SECURITY_POLICY.md.
 */
import {renderStaticDocumentContents,StaticDocumentError,type StaticRenderOptions} from "./static_document.js";

/** Name to allowlist in the host's `trusted-types` directive. */
export const staticTrustedTypesPolicyName="breditor-static-html";

/** Opaque `TrustedHTML` produced by the renderer policy; assignable to `innerHTML` and React's `__html`. */
export interface StaticTrustedHtml {readonly __breditorStaticTrustedHtml?:never}

interface HtmlPolicy {createHTML(input:string):StaticTrustedHtml}
interface PolicyFactory {createPolicy(name:string,rules:{createHTML(input:string):string}):HtmlPolicy}

let policy:HtmlPolicy|null|undefined;

function staticPolicy():HtmlPolicy|null {
 if(policy!==undefined)return policy;
 const factory=(globalThis as {trustedTypes?:PolicyFactory}).trustedTypes;
 if(factory===undefined||typeof factory.createPolicy!=="function")return policy=null;
 try{policy=factory.createPolicy(staticTrustedTypesPolicyName,{createHTML:input=>input});}
 catch(cause){
  // A CSP `trusted-types` directive without this name (or a duplicate name) refuses creation.
  // Leave the policy unset so a host that fixes its allowlist can retry without reloading.
  throw Object.assign(new StaticDocumentError("trusted-types-policy",`The host policy refuses the "${staticTrustedTypesPolicyName}" Trusted Types policy`,"$"),{cause});
 }
 return policy;
}

/**
 * Renders the inner static markup (as `renderStaticDocumentContents`) and returns it as
 * `TrustedHTML` when the realm implements Trusted Types, otherwise as the same string. Only
 * this renderer's validated and escaped output ever reaches the policy.
 */
export function renderStaticDocumentTrustedContents(document:unknown,options:Omit<StaticRenderOptions,"fragment">={}):StaticTrustedHtml|string {
 const html=renderStaticDocumentContents(document,options),trusted=staticPolicy();
 return trusted===null?html:trusted.createHTML(html);
}
