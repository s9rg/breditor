// The exact policies documented in docs/CONTENT_SECURITY_POLICY.md. The fixture server sends
// these headers; the spec asserts them byte for byte so the document and the test cannot drift.

/** Name of the only Trusted Types policy the editor packages create (static render output). */
export const staticTrustedTypesPolicyName = "breditor-static-html";

/** Strict policy for the editor, its Wasm runtime and an in-page shared relay. */
export function strictContentSecurityPolicy(nonce) {
  if (!/^[A-Za-z0-9+/_-]{22,}={0,2}$/u.test(nonce)) throw Error("Expected a base64 CSP nonce");
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    `trusted-types ${staticTrustedTypesPolicyName}`,
  ].join("; ");
}

/**
 * The one documented relaxation: policy-derived inline `style` attributes (text color,
 * background color, text size, page break). It adds attribute styles only, never style
 * elements, scripts or another Trusted Types policy.
 */
export function styleAttributeContentSecurityPolicy(nonce) {
  return `${strictContentSecurityPolicy(nonce)}; style-src-attr 'unsafe-inline'`;
}
