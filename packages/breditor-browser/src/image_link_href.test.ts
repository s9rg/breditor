import { describe, expect, it } from "vitest";
import {
  canonicalImageLinkHrefV1,
  imageLinkRenderAttributesV1,
  isImageLinkHrefV1,
} from "./image_link_href.js";
import { resolveInlineFormatRenderAttributes } from "./inline_format_render_attributes.js";

/** Same accept/reject table as Rust `rich_content/image_link.rs` unit tests. */
const imageLinkHrefParityTable = {
  good: [
    "https://example.com/",
    "http://example.com/",
    "https://a/",
    "https://www.example.com/path/to/page.html",
    "https://example.com/a%20b?q=1&r=two#frag",
    "https://example.com/?",
    "https://example.com/#",
    "https://example.com:8080/",
    "http://example.com:443/",
    "https://example.com:0/",
    "https://127.0.0.1/",
    "https://255.255.255.255/x",
    "https://xn--bcher-kva.de/",
    "https://sub_domain.example-site.co/",
    "https://example.com/it's/ok",
    "https://example.com/a?x=/y?z",
    "https://example.com/#a/b?c",
    "https://example.com//double",
    "https://example.com/...",
  ],
  bad: [
    "",
    "https://example.com",
    "HTTPS://example.com/",
    "https://Example.com/",
    "ftp://example.com/",
    "javascript:alert(1)",
    "mailto:someone@example.com",
    "data:text/html,x",
    "//example.com/",
    "/relative",
    "https:///x",
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "https://example.com:443/",
    "http://example.com:80/",
    "https://example.com:/",
    "https://example.com:08/",
    "https://example.com:65536/",
    "https://exa%6dple.com/",
    "https://example..com/",
    "https://example.com./",
    "https://127.1/",
    "https://01.2.3.4/",
    "https://256.1.1.1/",
    "https://example.123/",
    "https://0x7f/",
    "https://[::1]/",
    "https://example.com/a b",
    "https://example.com/a\tb",
    "https://example.com\\evil/",
    "https://example.com/a\\b",
    "https://example.com/\"quote\"",
    "https://example.com/<tag>",
    "https://example.com/`tick`",
    "https://example.com/{brace}",
    "https://example.com/a|b",
    "https://example.com/a^b",
    "https://example.com/./a",
    "https://example.com/a/..",
    "https://example.com/%2E%2e/a",
    "https://example.com/%zz",
    "https://example.com/%2",
    "https://example.com/?q='x'",
    "https://example.com/#a#b",
    "https://example.com/é",
  ],
} as const;

describe("V4 image-link targets", () => {
  it("admits exactly the native canonical subset (Rust parity table)", () => {
    for (const value of imageLinkHrefParityTable.good) expect(isImageLinkHrefV1(value), value).toBe(true);
    for (const value of imageLinkHrefParityTable.bad) expect(isImageLinkHrefV1(value), value).toBe(false);
    const long = `https://example.com/${"a".repeat(2048 - 20)}`;
    expect(isImageLinkHrefV1(long)).toBe(true);
    expect(isImageLinkHrefV1(`${long}a`)).toBe(false);
    expect(isImageLinkHrefV1(7)).toBe(false);
  });
  it("every admitted value is its own WHATWG serialization", () => {
    for (const value of imageLinkHrefParityTable.good) expect(new URL(value).href).toBe(value);
  });
  it("canonicalizes through the unchanged safeLinkV1 policy before the subset check", () => {
    expect(canonicalImageLinkHrefV1("HTTPS://Example.COM")).toBe("https://example.com/");
    expect(canonicalImageLinkHrefV1("https://example.com:443/a/./b/../c")).toBe("https://example.com/a/c");
    expect(canonicalImageLinkHrefV1("https://example.com/é")).toBe("https://example.com/%C3%A9");
    // Raw whitespace is refused by safeLinkV1 itself, never percent-encoded.
    expect(canonicalImageLinkHrefV1("https://example.com/a b")).toBeNull();
    for (const unsafe of ["javascript:alert(1)", "mailto:a@example.com", "https://user:pw@example.com/", "https://bücher.de/", "/relative", "https://example.com\\x"]) {
      expect(canonicalImageLinkHrefV1(unsafe), unsafe).toBeNull();
    }
    // Canonical but outside the native subset: refused rather than stored.
    expect(canonicalImageLinkHrefV1("https://[::1]/")).toBeNull();
  });
  it("emits exactly the inline safeLinkV1 attribute set", () => {
    const inline = (newWindow: boolean) => resolveInlineFormatRenderAttributes(
      { kind: "safeLinkV1", hrefProperty: "breditor-inline/href", openInNewWindowProperty: "breditor-inline/new-window" },
      [{ name: "breditor-inline/href", value: "https://example.com/" }, { name: "breditor-inline/new-window", value: newWindow }],
    );
    for (const newWindow of [false, true]) {
      expect(imageLinkRenderAttributesV1("https://example.com/", newWindow)).toEqual(inline(newWindow));
    }
    expect(imageLinkRenderAttributesV1("https://example.com/", true).map(a => a.name)).toEqual(["href", "rel", "target"]);
    expect(imageLinkRenderAttributesV1("javascript:alert(1)", true)).toEqual([]);
  });
});
