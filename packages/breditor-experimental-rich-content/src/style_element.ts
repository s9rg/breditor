/**
 * The single place where rich editor chrome creates a `<style>` element.
 *
 * Under a Content Security Policy without `'unsafe-inline'` in `style-src`/`style-src-elem`, an
 * inserted `<style>` element applies only when it carries the response nonce. Hosts publish that
 * nonce once with `<meta property="csp-nonce" nonce="…">` (the convention Vite's `html.cspNonce`
 * also emits); every editor stylesheet copies it before receiving text, so no mount needs an
 * option and the policy never needs `'unsafe-inline'` for styles. An explicit per-feature nonce
 * still wins. Without either, the element is created exactly as before. See
 * docs/CONTENT_SECURITY_POLICY.md.
 */

/** Selector of the host-published nonce carrier. */
export const richCspNonceSelector='meta[property="csp-nonce"]';

/** Reads the host-published CSP nonce of `document`, or `undefined` when none is published. */
export function richDocumentCspNonce(document:Document):string|undefined{
 const carrier=document.querySelector<HTMLMetaElement>(richCspNonceSelector);
 if(!carrier)return undefined;
 // Browsers hide the content attribute once a nonce-bearing policy applies; the IDL value remains.
 const value=carrier.nonce||carrier.getAttribute("nonce")||"";
 return value===""?undefined:value;
}

/** Creates an unattached `<style>` element whose nonce is set before its CSS text. */
export function createRichStyleElement(document:Document,css:string,nonce?:string):HTMLStyleElement{
 const style=document.createElement("style"),value=nonce??richDocumentCspNonce(document);
 if(value!==undefined)style.nonce=value;
 style.textContent=css;
 return style;
}
