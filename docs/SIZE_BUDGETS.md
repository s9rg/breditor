# Browser release size budgets

Both V1 candidate profiles record the raw and level-9 gzip download sizes of
the rich local and shared Wasm binaries and JavaScript glue. Each measurement
includes the exact file's SHA-256. Run `node scripts/measure-candidate-runtime-size.mjs`
after building both paired runtimes to produce `target/candidate-runtime-size.json`.
Use these measurements when selecting V1 download budgets. The existing
default-package ceilings below still apply.

Unreleased WebKit boundary and fault-recovery fixes retain all ceilings. Fresh browser JavaScript
measures 1,080,821 bytes; fresh React JavaScript measures 862,002 raw / 224,717
gzip bytes, retaining 283 gzip bytes of application headroom. Wasm measures
1,607,696 raw / 450,626 gzip bytes; generated glue is 52,536 bytes. Browser
declarations measure 271,854 bytes. Clean-consumer tarballs measure 266,529,
32,084, and 521,821 bytes for browser, reference, and Wasm respectively.

The preceding exact-selection write elision retained all ceilings. Browser
JavaScript measured 1,079,528 bytes; fresh React JavaScript measured 861,510
raw / 224,536 gzip bytes (41 gzip bytes above alpha.22). Application gzip
headroom was 464 bytes. Declarations and Wasm measurements were unchanged.

Status: required release gate, verified for the unpublished
`0.3.0-alpha.22` session-recovery checkpoint.

Alpha.22 retains every ceiling. Browser JavaScript measures 1,079,033 bytes
and declarations 271,374 bytes. Fresh React JavaScript measures 861,364 raw /
224,495 gzip bytes; its Wasm measures 1,607,552 raw / 450,505 gzip bytes.
Final tarball dry-runs measure 265,875, 32,084, and 521,595 bytes for browser,
reference, and Wasm respectively. Clean package consumers and all size gates
pass. The application gzip budget has 505 bytes of headroom; future features
need an explicit size review, not an automatic ceiling increase.

Alpha.21 retains every ceiling. Browser JavaScript measures 1,078,641 bytes
and declarations 270,904 bytes. Fresh React JavaScript measures 859,186 raw /
223,836 gzip bytes; its Wasm measures 1,607,552 raw / 450,505 gzip bytes.
Final tarball dry-runs after documentation updates measure 265,365, 32,085,
and 521,594 bytes for browser, reference, and Wasm respectively. Clean package
consumers and all size gates pass.

Alpha.20 retains every ceiling. Browser JavaScript measures 1,077,469 bytes
and declarations 270,367 bytes. Freshly rebuilt React JavaScript measures
857,442 raw / 223,364 gzip bytes; its Wasm measures 1,607,692 raw / 450,484
gzip bytes. Clean-consumer tarballs measure 264,764, 32,084, and 521,589 bytes
for browser, reference, and Wasm respectively. All gates pass.

Alpha.19 retains every ceiling. Clean-consumer tarballs measure 264,565,
32,083, and 521,580 bytes for browser, reference, and Wasm respectively.
Rebuilt Wasm remains 1,607,692 raw / 450,471 gzip bytes; the reference
application remains 857,056 raw / 223,233 gzip JavaScript bytes. All gates pass.

Alpha.18 retains every ceiling. Clean-consumer tarballs measure 264,566,
32,083, and 521,603 bytes for browser, reference, and Wasm respectively,
unchanged from alpha.17. The rebuilt Wasm remains 1,607,692 raw / 450,471 gzip
bytes; the reference application remains 857,056 raw / 223,233 gzip JavaScript
bytes. All size gates pass.

Alpha.17 retains every ceiling and the same raw Wasm/application sizes below.
The size gate passed after the clean package-consumer rebuild. Browser,
reference, and Wasm tarballs measure 264,566, 32,083, and 521,603 bytes.

Alpha.16 retains every ceiling and the alpha.15 raw Wasm/application sizes
below. The size gate passed against the artifacts rebuilt by the clean package
consumer gate. Browser/reference/Wasm tarballs measure 264,565, 32,083, and
521,603 bytes respectively.

Alpha.15 retains every ceiling. Its generated Wasm is 1,607,692 bytes and
450,471 gzip bytes; the reference application is 857,056 raw and 223,233 gzip
JavaScript bytes. Clean consumer tarballs measure 264,565 bytes for browser,
32,083 for reference, and 521,580 for Wasm. All release budgets pass.

Alpha.14 retains every alpha.13 ceiling. Its generated Wasm is 1,607,732
bytes; the reference application is 857,056 raw and 223,235 gzip JavaScript
bytes. The clean consumer gate also passes with browser, reference, and Wasm
tarballs of 264,564, 32,083, and 521,617 bytes respectively. The new Rust-only
local-log APIs do not require a larger browser payload budget.

Run `npm run check:size`. The command first builds every workspace, then
measures the actual generated package artifacts and the production React
reference build. It fails when an expected emitted set is empty, a required
singleton is absent or duplicated, or a budget is exceeded. Browser package
sets are enumerated recursively so nested emitted modules cannot escape the
total.

`npm run smoke:packages` rebuilds the packages, not the React production app.
Before using the size-check helper directly after that gate, also rebuild
`@breditor/example-react`; otherwise app measurements may describe stale output.

The current release ceilings are deliberately explicit:

- all emitted `@breditor/browser` JavaScript: 1,085,000 bytes;
- all emitted browser declarations: 276,000 bytes;
- all emitted `@breditor/reference-highlight` JavaScript: 82,000 bytes;
- all emitted reference-package declarations: 72,000 bytes;
- generated Wasm binary: 1,610,000 bytes;
- generated Wasm JavaScript glue: 100,000 bytes;
- packed `@breditor/browser` tarball: 270,000 bytes;
- packed `@breditor/reference-highlight` tarball: 35,000 bytes;
- packed `@breditor/wasm` tarball: 525,000 bytes;
- reference-application JavaScript: 865,000 raw and 225,000 gzip bytes; and
- reference-application Wasm: 1,610,000 raw and 452,000 gzip bytes.

Alpha.6 recalibrated only the two raw JavaScript ceilings from 800,000 to
825,000 browser-package bytes and from 700,000 to 725,000 reference-application
bytes. The final Alpha.6 gate measured:

- browser-package JavaScript: 812,022 bytes;
- browser declarations: 218,408 bytes;
- reference-application JavaScript: 708,638 raw and 186,131 gzip bytes;
- generated Wasm: 1,224,221 bytes; and
- generated Wasm JavaScript glue: 46,732 bytes.

Alpha.7 recalibrates only the browser-package JavaScript and declaration
ceilings, from 825,000 to 860,000 bytes and from 225,000 to 235,000 bytes. Its
measured artifacts are:

- browser-package JavaScript: 848,850 bytes;
- browser declarations: 225,622 bytes;
- reference-application JavaScript: 722,537 raw and 189,216 gzip bytes;
- generated Wasm: 1,224,768 bytes; and
- generated Wasm JavaScript glue: 46,732 bytes.

The measured growth is the reviewed strict semantic-intent result adapter,
immediate-only public and toolbar delivery, descriptor-correlated action-state
catalog, and toolbar/profile admission code. The application, Wasm, glue,
gzip, and package-tarball ceilings are unchanged; the gate still counts every
emitted module recursively.

The historical `0.2.0-alpha.8` checkpoint added separate ceilings for the
callback-free reference package rather than hiding it inside the browser
allowance. Its clean package artifacts measured:

- reference Highlight JavaScript: 8,088 bytes;
- reference Highlight declarations: 7,880 bytes; and
- packed `@breditor/reference-highlight` tarball: 9,430 bytes.

The first two values recursively total every emitted `.js` or `.d.ts` file.
The tarball value comes from the same lifecycle-disabled pack used by the clean
three-package consumer gate. The 12,000/12,000/20,000-byte ceilings leave
reviewable headroom without allowing a reference example to become an
unbounded runtime or silently bundle another browser copy.

A clean `0.2.0-alpha.8` rebuild of both that release candidate and the
unchanged `0.2.0-alpha.7` tag with the lockfile-selected Node/Vite/Rolldown
toolchain produced 734,688 raw and 194,970 level-9-gzip application JavaScript
bytes. The raw application ceiling therefore moves from 725,000 to 750,000
bytes; the gzip ceiling remains 200,000. The same-source tagged comparison
produced the same 734,688-byte output, so this recalibration is build-output
headroom rather than reference-extension code being added to the React
application.

The final `0.2.0` gate measured:

- browser-package JavaScript: 848,842 bytes;
- browser declarations: 225,614 bytes;
- reference Highlight JavaScript: 8,088 bytes;
- reference Highlight declarations: 7,880 bytes;
- generated Wasm: 1,224,760 bytes;
- generated Wasm JavaScript glue: 46,732 bytes;
- reference-application JavaScript: 734,680 raw and 194,962 gzip bytes;
- reference-application Wasm: 1,224,760 raw and 362,048 gzip bytes;
- packed browser package: 210,754 bytes;
- packed reference Highlight package: 9,435 bytes; and
- packed Wasm package: 428,471 bytes.

No final-release ceiling was widened.

The `0.3.0-alpha.2` typed-formatting checkpoint recalibrates only the packed
Wasm tarball ceiling from 450,000 to 455,000 bytes. Its clean deterministic
build measured:

- generated Wasm: 1,310,315 bytes;
- reference-application Wasm gzip: 384,753 bytes; and
- packed Wasm package: 451,381 bytes.

The raw and gzip Wasm ceilings remain unchanged. The 1,381-byte overflow over
the prior packed ceiling is attributable to the reviewed property-aware action,
validation, and exact replay paths now linked into the browser engine; package
contents and deterministic two-build checks remain unchanged.

The `0.3.0-alpha.3` checkpoint recalibrates the browser, declaration, Wasm,
demo, and Wasm-tarball ceilings for the reviewed ABI 4 bridge: Profile Bootstrap
V2, typed descriptor/projection getters, strict typed action/intent JSON,
explicit V3 profile factories, browser property validation,
`executeIntentJson()`, and Session V3 IndexedDB/autosave. Its passing actual /
ceiling measurements are:

- browser-package JavaScript: 905,441 / 910,000 bytes;
- browser declarations: 235,040 / 245,000 bytes;
- reference Highlight JavaScript: 8,088 / 12,000 bytes;
- reference Highlight declarations: 7,880 / 12,000 bytes;
- generated Wasm: 1,559,138 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 766,787 / 775,000 raw bytes and
  202,015 / 210,000 gzip bytes;
- reference-application Wasm: 1,559,138 / 1,600,000 raw bytes and
  433,691 / 450,000 gzip bytes;
- packed browser package: 221,799 / 225,000 bytes;
- packed reference Highlight package: 9,529 / 20,000 bytes; and
- packed Wasm package: 502,756 / 520,000 bytes.

The packages remain unpublished. These are local deterministic-build and
isolated-tarball gates, not registry size claims. Historical `0.2.0` and
alpha.2 measurements above remain the results for those checkpoints.

This includes the profile-aware projection path, descriptor-only bounded array
admission, and brand-checked native Event-family, Selection,
`AbstractRange`/`Range`/`StaticRange`, ClipboardEvent, and DataTransfer
boundaries. The gzip application, declaration, Wasm, glue, and package ceilings
were not raised. The new raw ceilings are explicit headroom for reviewed
semantic and browser-security code, not a code-splitting or file-enumeration
escape.

The `0.3.0-alpha.4` checkpoint recalibrates only the artifacts that now carry
the reviewed closed `safeLinkV1` policy, the additive Highlight + Link reference
profile, and the React-owned typed Link form. Its final clean-build actual /
ceiling measurements are:

- browser-package JavaScript: 931,778 / 950,000 bytes;
- browser declarations: 240,208 / 245,000 bytes;
- Highlight + Link reference JavaScript: 25,391 / 28,000 bytes;
- Highlight + Link reference declarations: 21,764 / 24,000 bytes;
- generated Wasm: 1,558,739 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 783,144 / 800,000 raw bytes and
  206,251 / 210,000 gzip bytes;
- reference-application Wasm: 1,558,739 / 1,600,000 raw bytes and
  433,449 / 450,000 gzip bytes;
- packed browser package: 228,658 / 235,000 bytes;
- packed Highlight + Link reference package: 14,624 / 20,000 bytes; and
- packed Wasm package: 502,604 / 520,000 bytes.

The browser JavaScript, reference JavaScript/declaration, application raw
JavaScript, and browser-tarball ceilings move from their alpha.3 values. The
browser declaration, gzip, Wasm, glue, reference-tarball, and Wasm-tarball
ceilings remain unchanged. Alpha.4 changes neither Wasm ABI 4 nor a durable
format; the small Wasm-size movement is deterministic release-string and
link-layout variation rather than a new transport surface.

The `0.3.0-alpha.5` checkpoint keeps every alpha.4 ceiling. Its final clean,
reproducible build and lifecycle-disabled package gate measured:

- browser-package JavaScript: 931,778 / 950,000 bytes;
- browser declarations: 240,208 / 245,000 bytes;
- Highlight + Link reference JavaScript: 25,391 / 28,000 bytes;
- Highlight + Link reference declarations: 21,764 / 24,000 bytes;
- generated Wasm: 1,568,465 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 783,144 / 800,000 raw bytes and
  206,251 / 210,000 gzip bytes;
- reference-application Wasm: 1,568,465 / 1,600,000 raw bytes and
  436,851 / 450,000 gzip bytes;
- packed browser package: 228,964 / 235,000 bytes;
- packed Highlight + Link reference package: 14,747 / 20,000 bytes; and
- packed Wasm package: 506,509 / 520,000 bytes.

Executable-code growth is confined to the reviewed Rust property-preserving
structural operation and action paths; package tarball deltas also include the
alpha.5 version and documentation updates. Alpha.5 adds no browser module, Wasm
ABI signature, durable-format generation, or package file class; all three
package tarballs still pass isolated import, type-check, production-bundle, and
real-Chromium initialization from local artifacts.

The `0.3.0-alpha.6` checkpoint also keeps every alpha.5 ceiling. Its final
clean, reproducible build and lifecycle-disabled package gate measured:

- browser-package JavaScript: 931,778 / 950,000 bytes;
- browser declarations: 240,208 / 245,000 bytes;
- Highlight + Link reference JavaScript: 25,391 / 28,000 bytes;
- Highlight + Link reference declarations: 21,764 / 24,000 bytes;
- generated Wasm: 1,574,285 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 51,502 / 100,000 bytes;
- reference-application JavaScript: 783,144 / 800,000 raw bytes and
  206,253 / 210,000 gzip bytes;
- reference-application Wasm: 1,574,285 / 1,600,000 raw bytes and
  438,793 / 450,000 gzip bytes;
- packed browser package: 229,147 / 235,000 bytes;
- packed Highlight + Link reference package: 14,839 / 20,000 bytes; and
- packed Wasm package: 508,441 / 520,000 bytes.

The measured executable growth is confined to the reviewed Rust
cross-paragraph property replacement and its exact history path. Documentation
and release-version changes account for the remaining tarball movement.
Alpha.6 adds no browser module, Wasm ABI signature, schema-fingerprint input,
durable-format generation, or package file class. The clean reference consumer
still initializes both the legacy Highlight profile and the combined typed
Highlight + Link profile from local tarballs in Chromium.

The `0.3.0-alpha.7` checkpoint recalibrates only artifacts that carry the new
ABI-5 descriptor correlation and browser-owned native form runtime. Its final
clean-build and isolated-package measurements are:

- browser-package JavaScript: 996,053 / 1,011,000 bytes;
- browser declarations: 249,799 / 254,000 bytes;
- Highlight + Link reference JavaScript: 26,543 / 28,000 bytes;
- Highlight + Link reference declarations: 21,792 / 24,000 bytes;
- generated Wasm: 1,586,629 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 807,402 / 822,000 raw bytes and
  211,828 / 216,000 level-9-gzip bytes;
- reference-application Wasm: 1,586,629 / 1,600,000 raw bytes and
  442,976 / 450,000 level-9-gzip bytes;
- packed browser package: 242,668 / 248,000 bytes;
- packed Highlight + Link reference package: 15,259 / 20,000 bytes; and
- packed Wasm package: 513,256 / 520,000 bytes.

The widened browser JavaScript/declaration and browser-tarball ceilings account
for strict typed-form admission, canonical DOM/focus ownership, bounded JSON
construction, and ABI-5 descriptor validation. The application ceilings move
only enough to carry that framework-neutral runtime in the eager demo bundle.
Reference-package, Wasm, glue, and Wasm-tarball ceilings remain unchanged; no
file class, code-splitting exemption, or package-content escape was added.

The `0.3.0-alpha.8` checkpoint keeps every alpha.7 ceiling. Its final clean,
reproducible build and lifecycle-disabled package gate measured:

- browser-package JavaScript: 1,009,591 / 1,011,000 bytes;
- browser declarations: 251,131 / 254,000 bytes;
- Highlight + Link reference JavaScript: 26,543 / 28,000 bytes;
- Highlight + Link reference declarations: 21,792 / 24,000 bytes;
- generated Wasm: 1,598,400 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 812,611 / 822,000 raw bytes and
  213,143 / 216,000 level-9-gzip bytes;
- reference-application Wasm: 1,598,400 / 1,600,000 raw bytes and
  447,834 / 450,000 level-9-gzip bytes;
- packed browser package: 246,169 / 248,000 bytes;
- packed Highlight + Link reference package: 15,549 / 20,000 bytes; and
- packed Wasm package: 517,938 / 520,000 bytes.

The measured growth is the reviewed exact property-state encoder, compile-time
per-set and collective state-batch admission proofs, Wasm state-value transport
coverage, and strict browser hydration/draft lifecycle. Alpha.8 adds no Wasm
method or ABI signature, durable record field, replay operation, package file
class, or size-budget increase. The narrow remaining Wasm, browser, and packed
package headroom is intentional evidence that the next executable feature must
include an explicit size review rather than silently widening a ceiling.

The `0.3.0-alpha.9` checkpoint recalibrates only the emitted reference-package
JavaScript and declaration ceilings. The package now carries the additive
Showcase bootstrap, identities, Document-V2 helpers, six-format renderer, and
eight-control toolbar while preserving its Highlight and Formatting surfaces.
Its clean-build measurements are:

- browser-package JavaScript: 1,009,591 / 1,011,000 bytes;
- browser declarations: 251,131 / 254,000 bytes;
- reference Showcase JavaScript: 42,368 / 45,000 bytes;
- reference Showcase declarations: 35,149 / 39,000 bytes;
- generated Wasm: 1,598,400 / 1,600,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 819,688 / 822,000 raw bytes and
  214,255 / 216,000 level-9-gzip bytes;
- reference-application Wasm: 1,598,400 / 1,600,000 raw bytes and
  447,831 / 450,000 level-9-gzip bytes;
- packed browser package: 246,370 / 248,000 bytes;
- packed reference Showcase package: 19,537 / 20,000 bytes; and
- packed Wasm package: 518,294 / 520,000 bytes.

The reference growth is declarative profile, fixture, and presentation code,
not a new editor runtime or copied browser module. Browser, application, Wasm,
glue, and every tarball ceiling remain unchanged. The narrow packed-reference
headroom is intentional and makes another reference feature require a fresh
artifact review.

The `0.3.0-alpha.10` checkpoint recalibrates only the raw Wasm and level-9-gzip
Wasm ceilings for the reviewed clear-inline-formatting core and browser path.
Its clean-build measurements are:

- generated Wasm: 1,607,767 / 1,610,000 bytes; and
- reference-application Wasm: 1,607,767 / 1,610,000 raw bytes and
  450,614 / 452,000 level-9-gzip bytes;
- packed browser package: 246,959 / 248,000 bytes;
- packed reference Showcase package: 19,763 / 20,000 bytes; and
- packed Wasm package: 521,224 / 522,000 bytes.

The generated and reference-application raw Wasm ceilings move from 1,600,000
to 1,610,000 bytes, and the reference-application gzip ceiling moves from
450,000 to 452,000 bytes. The Wasm tarball ceiling moves narrowly from 520,000
to 522,000 bytes after the reproducible clean package measured 521,224 bytes;
the remaining 776 bytes are reviewable headroom rather than a package-content
escape. Every JavaScript, declaration, glue, browser-tarball, and
reference-tarball ceiling remains unchanged.

The `0.3.0-alpha.11` checkpoint recalibrates only the browser JavaScript and
declaration ceilings and the eager reference application's JavaScript ceilings
for the reviewed declarative keyboard-shortcut compiler and routing path. Its
clean-build measurements are:

- browser-package JavaScript: 1,035,492 / 1,040,000 bytes;
- browser declarations: 259,950 / 264,000 bytes;
- reference Showcase JavaScript: 43,987 / 45,000 bytes;
- reference Showcase declarations: 35,556 / 39,000 bytes;
- generated Wasm: 1,607,767 / 1,610,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 830,606 / 835,000 raw bytes and
  217,848 / 220,000 level-9-gzip bytes;
- reference-application Wasm: 1,607,767 / 1,610,000 raw bytes and
  450,655 / 452,000 level-9-gzip bytes;
- packed browser package: 255,252 / 260,000 bytes;
- packed reference Showcase package: 20,724 / 22,000 bytes; and
- packed Wasm package: 521,386 / 522,000 bytes.

The emitted browser growth is the bounded manifest copier, exact
profile-to-command compiler, chord indexes, keyboard routing, and
toolbar-derived `aria-keyshortcuts` presentation. The application carries the
same runtime plus the Showcase declarations. The browser tarball ceiling moves
from 248,000 to 260,000 bytes for the two reviewed browser modules and expanded
contract documentation. The reference tarball ceiling moves from 20,000 to
22,000 bytes for its declarative Showcase manifest and documentation. Rust,
generated Wasm, Wasm glue, reference emitted-code, and Wasm-tarball ceilings
remain unchanged. No code-splitting exemption, package-content escape,
callback registry, or browser-owned semantic command was added.

The `0.3.0-alpha.12` checkpoint recalibrates only the artifacts that carry the
closed RGB24 renderer/native-field presentation and the separate Color
Showcase profile. Its final clean-build and lifecycle-disabled package
measurements are:

- browser-package JavaScript: 1,051,010 / 1,060,000 bytes;
- browser declarations: 263,925 / 264,000 bytes;
- reference Color Showcase JavaScript: 61,211 / 65,000 bytes;
- reference Color Showcase declarations: 51,144 / 55,000 bytes;
- generated Wasm: 1,607,767 / 1,610,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 841,764 / 850,000 raw bytes and
  220,305 / 225,000 level-9-gzip bytes;
- reference-application Wasm: 1,607,767 / 1,610,000 raw bytes and
  450,651 / 452,000 level-9-gzip bytes;
- packed browser package: 259,230 / 270,000 bytes;
- packed reference Color Showcase package: 26,263 / 28,000 bytes; and
- packed Wasm package: 521,510 / 522,000 bytes.

The browser JavaScript and application ceilings move only for the reviewed
`safeTextColorV1` canonical-attribute path, exact RGB24 form conversion and
hydration, and composition/clipboard admission. Reference code, declarations,
and tarball ceilings move for the additive frozen Color Showcase profile,
fixtures, typed-input helpers, and presentation manifests. The browser tarball
ceiling includes the expanded contract documentation. Wasm, glue, Wasm gzip,
Wasm tarball, and browser-declaration ceilings remain unchanged; no Rust or
Wasm executable feature, file-class exemption, code-splitting escape, or
arbitrary CSS surface was added.

The `0.3.0-alpha.13` checkpoint recalibrates only the artifacts that carry the
reviewed exhaustive integer-token renderer, native integer-select form, frozen
Size Showcase profile/fixtures, and eleven-control/eight-recipe demo. Its
clean-build actual / ceiling measurements are:

- browser-package JavaScript: 1,076,764 / 1,085,000 bytes;
- browser declarations: 270,320 / 276,000 bytes;
- reference Size Showcase JavaScript: 77,808 / 82,000 bytes;
- reference Size Showcase declarations: 67,167 / 72,000 bytes;
- generated Wasm: 1,607,767 / 1,610,000 bytes;
- generated Wasm JavaScript glue: 52,572 / 100,000 bytes;
- reference-application JavaScript: 857,056 / 865,000 raw bytes and
  223,236 / 225,000 level-9-gzip bytes;
- reference-application Wasm: 1,607,767 / 1,610,000 raw bytes and
  450,656 / 452,000 level-9-gzip bytes;
- packed browser package: 264,496 / 270,000 bytes;
- packed reference Size Showcase package: 32,042 / 35,000 bytes; and
- packed Wasm package: 521,662 / 525,000 bytes.

Browser JavaScript/declaration ceilings move for the closed renderer-policy,
DOM inverse-admission, form-validation, and native-select modules. Reference
JavaScript/declaration and tarball ceilings move for the additive profile,
documents, typed input helpers, and presentation manifests. The eager demo raw
JavaScript ceiling moves only enough to carry those reviewed features. The
browser tarball ceiling remains unchanged; its existing headroom covers the
expanded documentation. Raw/gzip Wasm and glue ceilings remain unchanged
because alpha.13 adds no Rust production or generated Wasm feature. The Wasm
tarball ceiling moves narrowly for release metadata/documentation headroom,
not executable growth. No file-class exemption, code-splitting escape,
arbitrary attribute/CSS mapping, custom select, or callback registry was added.

These are regression ceilings, not claims that every consumer downloads every
unbundled browser module. They include measured headroom for the supported
content-egress boundary without hiding growth by raising the bundler warning.
Gzip measurements use Node's level-9 gzip implementation and are reproducible
comparisons, not exact transfer-size promises for every CDN.

The browser build minifies each emitted ESM module with the pinned Rolldown
toolchain and keeps function and class names. Shipped declarations retain their
signatures. The package entry points and core editor, clipboard, HTML host,
autosave, and command interfaces retain their editor hover documentation.
Supporting declarations ship without comments. The source retains the complete
API documentation.

The three packed-tarball ceilings run inside `npm run smoke:packages`, after
explicit browser/reference builds and the two-build Wasm package check and
before isolated installation. Packing disables lifecycle hooks so ambient npm
configuration cannot turn those prerequisites into a stale-artifact pass.

Native release builds keep optimization level 3 and one code-generation unit
without LTO. Shipped Wasm instead uses the dedicated `wasm-release` profile:
maximum size optimization (`opt-level = "z"`), fat LTO, one code-generation unit, aborting panics, and
stripped symbols. The pinned package pipeline also removes Wasm name and
producer sections and uses exact `rolldown 1.2.7` to deterministically minify
generated JavaScript glue while retaining its declaration link. The build
shares the generated string-result and handle lifecycle implementations before
minification. Wasm export signatures and the checked-in declarations stay
identical. Package checks rebuild twice and compare complete hashes. On supported POSIX build hosts,
canonical source-path remapping plus exact logical/physical build-root checks
and common user-home pattern checks prevent host-specific workspace,
Cargo-home, or target prefixes from entering the module. Canonical relative
paths such as `cargo/registry/...` remain intentionally available for useful
panic locations. This reviewed recipe preserves the native throughput policy.
It kept ABI 3 within the historical `0.2.0` ceilings, ABI 4 within the alpha.6
ceilings, and ABI 5 within the current alpha.13 ceilings listed above.

The production React example opens the fixed Text Size Showcase profile. Its
build folds away experimental heading and list paths and compacts static
internal exception messages. The SDK and the separate experimental demos
retain those paths and diagnostics. The bundled HTML entity lookup table is
compressed as data and restored losslessly before the editor initializes.

The current React example deliberately initializes the editor eagerly and
disables Vite's module-preload polyfill because its production build emits one
JavaScript chunk and no preload links. The gate totals every emitted JavaScript
chunk, so future code splitting cannot evade either the raw or gzip ceiling.
The eager chunk can exceed Vite's generic 500 kB warning while still passing
the explicit product budgets; the gate does not suppress or relabel that
warning as an error.

## Rich editor demo latency sample

With the paired rich runtime built, run
`npx playwright test -c experiments/rich-browser/playwright.config.mjs demo-latency.spec.mjs`.
The browser report records cold page readiness, 25 warm calls each for text
insertion, Undo and Redo, and 25 synthetic plain-text pastes on the same demo
document. The retained matrix names the browser engines, host CPU and OS,
document digest, byte length and top-level block count. It records the source
digest and checks the Wasm binary and glue loaded by all three browsers
against the generated runtime. The command samples measure dispatch and
synchronous rendering. Use these measurements as a scoped baseline when
selecting broader V1 latency budgets. The [November 23 matrix](qualification/2026-11-23-rich-demo-latency-provenance.json)
retains a clean-source sample on Apple M1 Pro across Chromium, Firefox and
WebKit.

The installed editor browser matrix also records two wall-clock samples for
its two-peer task, table, code, and raster fixture. Offline replay starts when
the paused peer reconnects and ends when both documents agree and the other
peer renders the uploaded image. Relay restart starts when the stopped relay
is relaunched and ends when both peers are ready and agree. Each sample names
the browser version and host architecture. Both include test-runner polling.

## Installed local input latency

Build the independent installed consumer with
`node scripts/check-editor-package.mjs`, then run
`node scripts/record-installed-input-latency.mjs`. The Chrome sample records
20 repetitions each of a trusted typed key, a 1,000-byte plain-text paste
event, and keyboard Undo for each. The timer starts at the browser input event
and ends when the matching text mutation is observable. The probe verifies the
native edit and exact canonical document JSON after each Undo outside the
timed interval. It hashes the browser's HTML, JavaScript and Wasm responses
and checks them against the installed production bundle. The paste uses
fixture clipboard data and the display refresh is outside the measurement.

On the Apple M1 Pro with Chrome 158.0.8127.37, the 19-block, 9,487-byte
document reached 2.5 ms p95 for typing and 2.7 ms for paste. The 131-block,
56,219-byte document reached 5.8 ms for typing and 6.1 ms for paste. The
initial installed fixture reached ready in 383 ms. This is one workstation
sample under its ordinary workload. It supplies an installed fixture baseline
for the supported size and latency review.
[Source, archive hashes and measured results](qualification/2026-11-24-installed-chrome-local-input-latency.json)

## Installed shared editor memory sample

The experiment requires the installed consumer produced by
`node scripts/check-editor-package.mjs` and a local Google Chrome installation.

```sh
node node_modules/@playwright/test/cli.js test -c experiments/editor-browser-memory/playwright.config.mjs
```

The experiment edits, synchronizes, and undoes each change across two shared
owners for 100 rounds. It checks peer convergence on each change and compares
the exact saved checkpoints after closing both owners and reloading. It reports
Chrome's heap, backing storage, and DOM counters after explicit garbage
collection at each checkpoint. The counters apply to this fixture. A total
process memory budget and a supported document limit require further measurements.

On November 22, 2026, Google Chrome 157.0.8103.80 on an Apple Silicon
MacBookPro18,1 with macOS 26.6.2 completed the 100 rounds with both exact
checkpoints recovered. After garbage collection, the backing storage counter
rose from 0.83 MB at startup to 30.80 MB after 100 rounds, and was 30.82 MB
after reload. The used JS heap was 3.89 MB at startup and 3.95 MB after
reload.

The follow-up isolated the growth with 25 rounds on the same installed
browser fixture. Frame reads alone held the backing-storage counter at
0.82 MB. With local edits and Undo it reached 0.96 MB. With full-frame sync
between peers it reached 7.66 MB. The original journals kept 50 remote
records each. Heap snapshots identified two serialized checkpoint strings
whose lengths matched the journals still held by the persistence owners.

Clearing the terminal owners' cached checkpoint strings reduced the
counter from 7.66 MB to 0.75 MB at close. Both journals reopened with the
same checkpoint bytes, and the active owners again held their checkpoint
copies. The test checks that close releases backing storage on the scale
of those journals. Live full-frame history and Wasm memory still need
qualification against the supported operating envelope.

The November 23 repeat on the same Chrome version completed 100 edit/Undo
rounds on newly packed SDK archives. Backing storage rose from 0.83 MB to
30.80 MB during the active session and fell to 0.76 MB after both owners
closed. Reopening restored both saved checkpoints byte-for-byte and brought
backing storage to 30.82 MB. [Exact archives and measured samples](qualification/2026-11-23-installed-chrome-shared-memory.json)

The November 24 run on Google Chrome 158.0.8127.37 and Apple M1 Pro measured
the same two-peer, 2,825-byte document through 100 edit/Undo rounds. Navigation
to the fixture's ready state took 330 ms. Across rounds 1–10 and 51–100, p95
typing rose from 39.7 to 219.3 ms, Undo from 40.5 to 228.6 ms, and direct peer
frame exchange from 62.1 to 398.4 ms. The document stayed the same size after
each Undo, while both histories grew and reopened byte-for-byte. The typing and
Undo samples time synchronous shared-core calls. The frame exchange takes place
within the page. This workload establishes observed history cost. The supported
operating envelope still needs separate measurement and review.
[Archive hashes, browser Wasm, and measurements](qualification/2026-11-24-installed-chrome-shared-history-latency.json)

The shared memory benchmark runs the same two-peer sequence with both the
original range policy and the SDK's opt-in `general-v1` policy. Each project
uses fresh browser storage and checks the declared policy before editing and
after exact recovery. Run the two policy samples by adding
`shared-memory.spec.mjs` to the command above.

The original policy retains exact incoming frames in its journal, including
cumulative frames that add no new operations. Live staging reimports retained
inputs and validates checkpoint budgets. The explicit `general-v1` policy
retains newly admitted deltas when all dependencies are available and skips
fully known frames. Persistence still exports and validates a complete
checkpoint when a native publication is saved. Each project reopens the
checkpoint format for its selected range policy.

In the [installed Chrome comparison](qualification/2026-11-24-installed-chrome-shared-range-policy-latency.json),
both policies completed 100 rounds and reopened both checkpoints byte-for-byte.
Across rounds 51–100, the original policy measured 223.6 ms p95 typing,
228.1 ms p95 Undo, and 399.5 ms p95 direct frame exchange. The `general-v1`
policy measured 32.2, 32.2, and 19.7 ms respectively. The combined checkpoints
contained 30,040,753 and 703,624 code units respectively. These measurements
cover the two-peer, 2,825-byte document and direct frame exchange on one host.

An installed Chrome sample measured the write path separately after 38 peer
edit/Undo rounds. For checkpoints from 383,425 to 426,954 bytes, the general
range session encoded and parsed each captured journal twice. The second
validation had a median cost of 1.5 ms. Reusing the synchronously admitted
checkpoint reduced this to one encode and parse per publication. Median
synchronous publication went from 33.1 ms to 31.2 ms across 15 samples, and
both peers reopened with identical checkpoint bytes in each build.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-shared-save-validation.json)

A separate [installed paired-save measurement](qualification/2026-11-24-installed-chrome-paired-save-validation.json)
used 1.43–1.46 MB records with document and comment histories and ten named
versions. Each measured comment publication went from four to two whole-record
serializations, two to one whole-record UTF-8 checks, and four to two native
journal parses. The document publications followed the same halving across two
save captures. Median synchronous publication went from 123.0 to 118.4 ms for
documents and 23.2 to 16.3 ms for comments in eight samples per lane. The same
durable record reopened byte-for-byte in both builds, and both Undo and Redo
still worked for the document and comments. A pending save retains one encoded
JSON string through commit or retry. These observations cover one installed
Chrome workload and establish no retained-memory or end-to-end performance bound.

After compiling the browser and collaboration packages, run the opt-in
measurement with Google Chrome installed.

```sh
node scripts/measure-paired-session-save.mjs
```

The [paired-session close regression](qualification/2026-11-24-installed-chrome-closed-paired-memory.json)
measures a live document, one discussion, and fourteen named versions. It also
discards a second owner after starting a write for a fifteenth version. The
old SDK retained 10.30 MB after ordinary close and 10.99 MB after discard.
After clearing the retired checkpoint and version cache, the same Chrome
isolate measurements retained 0.23 MB in each case. Both cases reopen the
exact native record and version catalog, including the late write that
completed before the writer leases released.

With Google Chrome installed, build the opt-in page and run the paired cases.

```sh
BREDITOR_EDITOR_PAIRED_MEMORY=1 node scripts/check-editor-package.mjs
BREDITOR_EDITOR_PAIRED_MEMORY=1 node node_modules/@playwright/test/cli.js test \
  -c experiments/editor-browser-memory/playwright.config.mjs paired-memory.spec.mjs
```

## Installed raster metadata enumeration

In Google Chrome 158.0.8127.37 on an Apple M1 Pro, listing metadata for 28
retained PNGs totaling 49,966,325 bytes reduced the observed peak increase in
Chrome backing storage from 50.0 MB to 32.1 MB. The largest IndexedDB result
fell from 50.0 MB to one 1.78 MB raster. Median list time rose from 31.7 ms to
34.8 ms across six observations per SDK. The cursor reads in primary-key order
and retains only each row's metadata for return. The installed archive fixture
checks ordered metadata, upload states and exact archive recovery on reload.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-asset-metadata-memory.json)

## Installed retained asset open

For twelve browser-encoded PNGs with queued, failed, cancelled and uploaded
states, every earlier `openRetained()` call constructed and discarded one
17,998,472-byte archive Blob. Every fixed call constructed zero whole-archive
Blobs. Reopening still validates each raster and the canonical archive header.
Explicit export produced identical bytes in both builds. Each test restored
its own exact native checkpoint and verified that Undo and Redo retained both
raster references. Both builds refused a changed retained raster.

Median open time was 165.2 ms before and 157.5 ms after across three calls per
build in one installed Chrome 158 fixture. The constructor census counts
whole-archive Blobs and their logical byte lengths for those calls.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-retained-asset-open.json)

Use the installed archive build and installed Google Chrome to repeat the
measurement.

```sh
node scripts/check-asset-backups-installed.mjs --reuse-runtime
node scripts/measure-retained-asset-open.mjs
```

## Retained raster validation payload reads

An installed Chrome 158 workload opened twelve retained PNGs and exported
the same store. Each candidate pass constructed twelve raster Blobs and
performed zero raster `arrayBuffer()` reads. The earlier build constructed 24
raster Blobs and performed twelve reads. Each avoided group accounted for
17,995,358 logical payload bytes per pass. The decoder still receives the
raster Blob and every asset is checked against its content hash.

Both builds produced the same complete archive and native checkpoint digests.
Cold restore preserved the upload queue and exact native Undo/Redo. Retained
open and explicit export both refused a modified raster. The counts describe
logical Blob constructor payload and read bytes for one workload.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-retained-raster-payload-reads.json)

## Installed retained asset reconciliation writes

The installed Chrome 158 fixture reconciled 12 local PNGs with an incoming
archive containing one new PNG and one explicit upload queue conflict. The
previous build submitted 13 raster rows carrying 19,494,940 bytes to IndexedDB.
The fixed build submitted two rows carrying 2,999,138 bytes, saving 16,495,802
logical raster payload bytes on the first apply. Both builds issued zero raster
writes when retrying after a cold reopen.

The transaction still compares the full retained target and keeps both
input archives. Both builds produced identical union, queue and native
checkpoint digests. Cold restore validated all 13 raster identities and
replayed native Undo and Redo. The count covers raster payloads passed to
IndexedDB and excludes metadata, browser implementation overhead and physical
disk I/O.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-asset-reconciliation-writes.json)

```sh
node scripts/check-asset-backups-installed.mjs --reuse-runtime
node scripts/measure-retained-asset-open.mjs --reconciliation-writes
```

## Installed upload queue writes

Cancel and retry calls on six uploaded rasters and retry calls on six pending
rasters left the queue unchanged. The earlier build submitted 18 asset rows
carrying 26,993,090 logical payload bytes to IndexedDB. The candidate
submitted zero asset rows for those calls. Both builds emitted all 18
existing status notifications.

A real cancel and retry on one pending raster still submitted two rows
carrying 2,999,284 bytes in both builds. The two complete backup snapshots
and native checkpoints had identical digests across the builds. Cold
restore kept the exact queue, receipts and native Undo and Redo. These
counts cover the raster payload on IndexedDB write requests.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-upload-queue-writes.json)

```sh
node scripts/check-asset-backups-installed.mjs --reuse-runtime
node scripts/measure-retained-asset-open.mjs --upload-queue-writes
```

## Installed continued generation reads

The V2 history and V1 predecessor in the Chrome workload shared five immutable
rows. The earlier build read 12 file records carrying 149,113 logical bytes
per snapshot. The candidate read the same seven unique records once, carrying
82,352 bytes. Cold open, backup export and reopening a separate restored store
agreed across all five IndexedDB snapshots.

The exact current and predecessor recovery hashes matched in both builds.
An intentionally mismatched predecessor digest still refused. Cold restored
native Undo and Redo preserved the original offline edit. The measurement
covers UTF-8 record bytes delivered by observed IndexedDB requests. Physical
I/O, memory and latency were outside its scope.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-continued-prefix-reads.json)

Build an installed editor using
`BREDITOR_EDITOR_ROLLOVER=1 node scripts/check-editor-package.mjs`, then run
the `reads shared immutable prefix` test with
`experiments/editor-browser-rollover/playwright.config.mjs`.

## Installed local checkpoint writes

The installed Chrome workload submitted six identical saves for each of
the original, document V1 and fingerprinted document V2 records. The earlier
build submitted 18 IndexedDB rows carrying 2,833,974 UTF-8 payload bytes.
The candidate acknowledged all 18 saves using the current durable row and
submitted zero writes. Each stored native checkpoint was about 154 KiB.

Two handles also alternated between different checkpoints for each family.
Both builds submitted the same six changed rows and exact payload sizes.
Cold reopen recovered the original bytes and replayed native Undo and Redo.
The counts cover logical UTF-8 payload bytes on checkpoint writes.
[Measurement and archive hashes](qualification/2026-11-24-installed-chrome-local-checkpoint-writes.json)

Build the vanilla installed SDK with `node scripts/check-editor-package.mjs`
and run the `installed repeated local checkpoint saves` case in
`experiments/editor-browser/playwright.config.mjs` to repeat the verification.
