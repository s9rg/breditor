# Native input rules

Breditor input rules recognize bounded typed shortcuts and prepare ordinary native
edits. They are an explicit behavior policy, not a Markdown parser, document
format, operation protocol or replacement for semantic toolbar commands.

The Rust planner, exclusive local/shared calls and optional Wasm/SDK expose the
first policy. Vanilla and React browser owners enable it only with
`inputRules: "markdown-v1"`. Omission keeps ordinary literal input. Final V1
qualification remains unfinished; paste,
composition, programmatic commands and recovery never enable it implicitly.

The [browser and installed-package checkpoint](qualification/2026-10-18-input-rules-browser-installed.json)
passes 27 selected checks, including fresh official runtime builds, independent
installed public imports/types, vanilla/root/React routing, exact reload and
future history. It also reproduces and repairs the shared whole-run replacement
bug below. Native platform qualification, remaining shortcuts and the V1 gates
stay open.

The earlier [exclusive typing and SDK checkpoint](qualification/2026-10-18-exclusive-input-rules-sdk.json)
passes 19 selected checks, including full native regressions, strict lint/docs,
actual rebuilt Wasm, optional SDK types and search regressions. The current
programmatic cases at that checkpoint restore 84 checkpoints in independently
pinned earlier Wasm readers and match 336 subsequent Undo/Redo checkpoints.
That specific compatibility evidence is not a promise that affected older
readers support the whole-run replacement repair described below.

The [native foundation checkpoint](qualification/2026-10-18-native-input-rules.json)
records full Rust regressions, strict lint/docs, wasm32 compilation and exact
earlier-Wasm recovery. It retains the failed runtime-resource staging attempt
and its same-source continuation; it is not a new browser feature or V1 approval.

## Literal input and reversal

Retain each local plain-input event through the ordinary typing path first. A
separately guarded `apply_markdown_input_rule` transformation then creates one
isolated native Undo group. For example, typing a space after `#` retains `# `;
the transformation removes that marker and changes the paragraph to a heading.
One Undo restores `# ` and its exact before-selection/pending formats. It does
not delete the user's trigger, rerun recognition or merge the automatic change
into an adjacent typing burst.

Both local and shared owners use this contract. Ordinary input and its
transformation are distinct accepted changes. A failed transformation cannot
discard already accepted literal input. Report a genuine transformation error;
do not retry the input or silently publish a partial conversion.

## Exclusive typing calls

Automatic hosts must use `insert_plain_text_with_markdown_rules` or
`insert_typing_text_with_markdown_rules` on the local Rust owner, or their
`_guarded` shared equivalents. The exclusive call retains ordinary input and
then attempts its conversion before any host callback or remote publication can
change the target. Do not implement this by invoking ordinary typing, notifying
subscribers and then reading a fresh target for a separate conversion.

The payload-free `RichInputRuleOutcome` distinguishes four results:

- `Unchanged`: empty input; no rule was attempted.
- `Inserted`: literal input committed, but no rule matched.
- `Applied`: input committed and a separately undoable conversion followed it.
- `Refused`: input committed, but rule planning or complete admission failed.
  Keep the literal text and report conversion refusal separately; never retry it.

Only a typing failure returns an outer error and leaves the whole call unchanged.
A nonmatch keeps the natural typing burst open. A successful conversion isolates
its own existing history group. Existing history capacities and retention still
apply; the native publication revision can advance twice in one exclusive call.

Wasm exposes the additive `markdownInputRulesVersion()` / shared
`markdown_input_rules_version()` capability, string version `1`, and separately
named plain/natural methods. Requests are strict bounded JSON with `text` and
`namespace`; natural typing additionally requires canonical decimal `clockMs`.
Read-only/stale observations reject before request parsing. The original
`execute`/`dispatch` unions and all checkpoint meanings remain unchanged.

Both optional SDKs expose `supportsMarkdownInputRules()`,
`insertPlainTextWithMarkdownRules(text, namespace, revision?)` and
`insertTypingTextWithMarkdownRules(text, clockMs, namespace, revision?)`. They
require the complete matching native pair and return the lowercase outcomes
above; older runtimes fail explicitly. The shared SDK notifies subscribers once,
after both native changes finish, and retains its existing reentrancy guard and
remote queue. Calls require a collapsed text caret; they never replace a range.

## Browser startup and input routing

Set `inputRules: "markdown-v1"` in local/shared DOM options or top-level startup
options. React accepts the same policy in `initialOptions`, owned for the current
`sessionKey`. The coordinator captures the choice at mount; mutating an options
object or rerendering the same session does not enable or disable shortcuts.
The option is not a saved setting. Reopening without it keeps literal input,
even when the restored history contains an earlier shortcut conversion.

Browser routing additionally requires `supportsMarkdownInputRouting()`, backed
by native `markdownInputRoutingVersion()` / shared
`markdown_input_routing_version()`, string `1`. This is a separate minimum from
the unchanged programmatic capability. Older programmatic-only, incomplete or
unknown packs reject before mount changes the host. Root factories reject an
unknown policy before acquiring storage or native ownership.

Only one plain local `beforeinput insertText` scalar at an admitted collapsed
text caret invokes the exclusive call; the one addition is `markdown-v1` Enter
(`insertParagraph`) at a collapsed code-block caret, which sends `"\n"` through
the same plain exclusive call (local and shared controllers) instead of the
ordinary hard break. Different, unreadable or multiple target
ranges do not trigger rules. Paste, replacement/autocorrection, remote updates,
composition and node/grid/document/range replacement retain their ordinary
paths. Browser eligibility checks do not recognize Markdown; native planning
does that. Ordinary nontrigger characters take a shared native fast path without
an additional full-view observation read.

The coordinator captures the intended caret before selection synchronization.
It allows exactly the required selection-only publication, then rejects if a
callback changed any further publication or retargeted the caret. Queued work
retains that exact revision and uses the existing bounded queue and remote
holds. A conversion publishes one final browser notification after both native
changes, while Undo still restores the complete literal trigger separately.

`onInputRuleRefused?: () => void` reports accepted literal input whose native
conversion was refused. The status also says the typed text was kept. This is
not a typing failure and must never cause a retry. It is delivered after the
accepted input, not while native insertion and conversion are in progress.

## Shared replacement repair and reader compatibility

The browser exclusion checks exposed an older native bug unrelated to shortcut
recognition: replacing a whole text source could fail while remapping the old
selection. Deletion removes its birth fragment; replacement characters use the
distinct empty fragment in that same source. A valid old endpoint could then
sit at a physical gap that no surviving chunk owned on its captured side.

The fixed reader first keeps every successful original character mapping. Only
for an unresolved endpoint whose preferred fragment has no visible chunks does
it try the same physical gap from the other side, then the known fragment gap.
The retained affinity and coordinates are not rewritten. A floating source-start
`Before` caret remains before replacement text. General-range tests retain the
actual resulting caret, exact recovery/Undo/Redo and concurrent peer characters.

A checkpoint containing such a previously refused whole-run replacement needs
the fixed shared reader. An independently pinned earlier reader still rejects
that case with its original anchor error. Hosts must match room participants and
backup readers to the fixed runtime; downgrading those checkpoints to affected
alpha readers is unsupported. Existing successful mappings, causal writes and
saved record formats remain unchanged. The browser-routing capability declares
the minimum runtime, not a new saved policy or automatic history migration.

## Native shortcut policy

Block rules require an ordinary paragraph and its exact complete prefix from
block start through the caret, ending in an ASCII space. Retained suffix text is
not copied or replaced.

- One through six `#` characters select the corresponding heading rank.
- `-`, `+` or `*` starts a bullet list.
- A canonical positive ordinal followed by `.` or `)` starts an ordered list at
  that ordinal. The existing maximum, 2,147,483,647, remains unchanged. Zero,
  leading zeroes, overflow and negative values stay literal.
- `>` wraps the retained paragraph in a blockquote.
- `[ ]`, `[x]` and `[X]` create an unchecked or checked task.
- Three backticks, optionally followed by a valid native code-language token,
  convert to code. Retained formatted suffix text rejects rather than losing
  styles. The resulting pending formats are explicitly plain.
- `---`, `***` or `___` creates a horizontal rule only when the marker occupies
  the whole block. The original paragraph remains as empty navigation text after
  the rule, with the same identity and a reachable caret.

Quotes, tasks, code and rules need rich grammar 2 or 3. Grammar 1 still supports
headings and ordinary lists (including list joining below). Captions do not
accept structural shortcuts. A required first paragraph/heading in a list or
task item may change heading rank, but is not replaced by a wrapper or code
block; the only other item-head shortcut is the task conversion below. Later
flow paragraphs can be wrapped normally.

### List continuation and code Enter

These rules complete `markdown-v1` itself rather than adding a new rule set. The
stability promise is about saved meaning: selection is never saved, checkpoints
record only ordinary admitted edits, and the Wasm calls, capabilities, outcomes
and history families are unchanged. A host on an older runtime simply keeps the
earlier literal or separate-list result. Every rule below is composed only from
existing retained-identity actions and their original causal commands; no item
body is flattened, copied or re-created.

**Existing-list task conversion.** `[ ] `, `[x] ` or `[X] ` typed at the start of
the first line of an item converts *that item* (not the whole list), matching
GitHub task-list items and block-based editors. Grammar requires task items in a
task list, so the list is split around the item: earlier items keep the original
list identity, the item becomes a one-task list (fresh `…:rule:tasks` /
`…:rule:task` identities, the typed completion), and later items continue in a
fresh `…:rule:tail` list only when items remain on both sides. The head paragraph,
its suffix text and any non-prose tail (nested lists, quotes, code, images) keep
their identities inside the task. When the converted item was the list's first
item and the list directly follows a task list, the task is appended to that
task list, so converting items one by one never leaves adjacent task lists.
Lowering: marker deletion, `OutdentListItems` (one item), `WrapTaskList` over the
head through the item's last body block, then, when joining, `MoveBlock` +
`OutdentTaskItems`. Literal: items of numbered lists (an unnumbered task would
silently drop the ordinal), items of lists nested inside another list item, items
whose body has a second paragraph/heading (each would become another task),
existing task items and grammar 1.

**Backward adjacent-list joining.** A list marker typed in a paragraph whose
directly preceding flow sibling is a compatible list appends one new item to that
list instead of creating a second adjacent list, as ProseMirror's wrapping rules
and the common editors built on it do. `-`, `+` and `*` join a preceding bullet
list. A numbered marker joins a preceding numbered list only when it is that
list's next ordinal (its continuation start, reversed lists counting down);
otherwise it starts a new list at the typed ordinal as before. `[ ]`/`[x]` join a
preceding task list with the typed completion. The paragraph keeps its identity
as the new item's head; a last item's trailing nested flow stays before the new
item. This also applies to later paragraphs inside an item after a nested list.
Lowering: the original wrap (`WrapList`/`WrapTaskList`), `MoveBlock` of the fresh
one-item list to the end of the target's last item, then `OutdentListItems`/
`OutdentTaskItems` of that item; the transient list identity disappears in the
same group. Literal (unchanged separate list): different kinds, a non-adjacent
list, and a following list (no forward join).

**Nesting.** Typing `- ` (or another list/quote/code marker) at the start of an
item's first line stays literal: an item head must remain prose, and the editors
this follows nest with Tab, not with a typed marker. A marker in a later
paragraph of an item still wraps it in a nested list (or joins a nested list
directly before it).

**Conventional code Enter.** Enter in a code block keeps inserting a line feed.
With `markdown-v1`, a collapsed code caret's Enter goes through the exclusive
plain call as the text `"\n"` (`RichInputRuleSet::is_trigger` and
`plan_rich_markdown_input_rule` accept it; the typed-scalar fast path
`is_rich_markdown_input_rule_trigger` is unchanged). When that retained line feed
leaves the caret at the very end of the block and the text ends in three line
feeds (two empty lines plus this Enter), one group deletes the three line feeds
and inserts a fresh empty paragraph (`…:rule:p`) directly after the code block in
the same flow, with freshly derived pending styles — Tiptap's
`exitOnTripleEnter` convention. One Undo restores all three line feeds with the
caret at the end of the code. Fewer empty lines, a caret before the end,
Shift+Enter, ranges and prose line feeds stay literal. The explicit
`exitCodeBlock` command (Mod+Enter) is unchanged.

Inline rules recognize `**body**` or `__body__` as strong, `*body*` or `_body_` as
emphasis, `~~body~~` as strike and single-backtick delimiters as inline code.
They trigger on the final delimiter scalar, retain body characters and existing
formats, and add the registered property-free standard format. The original
effective pending formats are restored at the resulting caret, so the new format
does not accidentally continue into following input.

An opener must begin the block or follow whitespace or ASCII punctuation other
than the same marker. Odd backslash escaping, empty/whitespace-edged bodies,
line breaks, ambiguous repeated delimiters and intraword openers stay literal.
Recognition does not unescape or normalize body text. Existing code blocks and
inline code/link ranges do not autoformat. General CommonMark parsing, nested
delimiter interpretation, smart punctuation and arbitrary host-defined patterns
are not implied by this first native policy. URL autolinking is the separate
opt-in `autolink-v1` set below; smart punctuation is the separate opt-in
`typography-v1` set.

## Optional autolink (`autolink-v1`)

`autolink-v1` is a second, separately selected rule set. It converts a typed
URL into the existing standard link format (`breditor-inline/link` with
`breditor-inline/href` and `breditor-inline/new-window: false`) and changes no
text. It is not a linkifier for paste, import, remote updates or arbitrary
HTML, and it is off unless a host selects it.

**Boundaries.** Recognition runs only after a retained local boundary:

- one typed ASCII space (`insertText " "`), through the same exclusive typing
  call as Markdown shortcuts; or
- Enter (`insertParagraph`) at a collapsed caret, through a separate exclusive
  split-and-link call. The URL must then end the retained left block.

Closing punctuation is deliberately not a trigger: typing `)` or `.` cannot know
whether the URL continues (`…/A_(b)`, `…/v1.2`). It is handled when the
following space or Enter arrives. Tab, no-break space, Shift+Enter (a hard
break), paste, replacement/autocorrection and composition never trigger.

**Candidate grammar.** The candidate is the final whitespace-free run before
the boundary, after skipping leading `(`, `[`, `{`, `<`, `"` or `'`. It must
begin with lowercase `https://`, `http://` or `www.`. Trailing `.`, `,`, `:`,
`;`, `!`, `?`, `'`, `"`, `*`, `_`, `~` and `>` are excluded repeatedly, as is a
closing `)`, `]` or `}` that has no matching opener inside the candidate (so
`(https://example.com/x_(y)).` links `https://example.com/x_(y)`). Excluded
characters stay plain text after the link.

**Target policy.** `www.` candidates target `https://www.…` (HTTPS is the safe
default; nothing is fetched to discover a scheme). A missing path serializes as
`/`, exactly as a WHATWG URL parser does. That is the only repair. The target
must then be admitted unchanged by the native canonical `safeLinkV1` subset —
the same Rust check that admits image links (`is_canonical_href`): absolute
HTTP(S), no credentials, ASCII only, lowercase host, no default port, no dot
segments, only complete percent escapes, no quotes, angle brackets, backslashes
or whitespace, and at most 2,048 UTF-8 bytes. Every admitted value is its own
`safeLinkV1` canonical serialization, so the renderer, the explicit link editor,
clipboard/HTML export and static rendering all treat it identically. Anything
the policy rejects — `javascript:`, `data:`, `mailto:`, `ftp:`, uppercase
schemes or hosts, IDN/Unicode text, user info, over-long targets — stays literal.
Use the explicit link editor for those spellings; it still applies `safeLinkV1`
itself.

**Exclusions.** No conversion inside code blocks, over inline code, over or
overlapping an existing link, when the standard link format is not installed in
the schema (the rule is inactive, not refused), in read-only owners, on a
selection that is not a collapsed caret, during composition, on paste or on a
remote update. A candidate that reaches the truncated recognition window floor
is not invented.

**History.** The literal boundary is retained first through the ordinary typing
or split path. The link is then one isolated native history group: one Undo
removes only the link and keeps the typed space or the paragraph split; Redo
reapplies it. The caret and effective pending formats after the boundary are
unchanged, so following input is never linked. Shared owners lower the plan to
one original guarded `set_format` command; recovery families and saved formats
are unchanged.

**API.** Rust: `RichInputRuleSet` (`MARKDOWN_V1`, `AUTOLINK_V1`, `union`),
`plan_rich_input_rule`, `plan_rich_paragraph_autolink_input_rule`,
`rich_autolink_candidate`, local `insert_plain_text_with_input_rules` /
`insert_typing_text_with_input_rules` / `apply_input_rule` /
`apply_paragraph_autolink_input_rule`, and shared `…_guarded` equivalents plus
`split_with_autolink_guarded`. Wasm exposes `inputRuleSetsVersion()` /
`input_rule_sets_version()` string `1`, strict JSON requests with a nonempty
duplicate-free `rules` list (`"markdown-v1"`, `"autolink-v1"`), and
`insertParagraphWithAutolink` / `split_with_autolink`. SDKs expose
`supportsInputRuleSets()`, `insertPlainTextWithInputRules`,
`insertTypingTextWithInputRules` and local `insertParagraphWithAutolink` /
shared `splitWithAutolink`. Outcomes are the same four payload-free states.

Browser owners select it with `inputRules: "autolink-v1"` or
`inputRules: ["markdown-v1", "autolink-v1"]` (local and shared DOM options,
top-level startup options and React `initialOptions`). An unknown, empty or
duplicate selection rejects before storage or native ownership. Markdown-only
selections keep the original native pair and runtime minimum; selecting
`autolink-v1` additionally requires the version-1 rule-set capability.

## Optional typography (`typography-v1`)

`typography-v1` is a third, separately selected rule set: automatic text
transformations in the sense of Tiptap's Typography extension and CKEditor's
text transformation feature. It replaces a just-typed character sequence with
its typographic form. It is off unless a host selects it, and it never runs on
paste, import, composition, remote updates, programmatic commands or recovery.

**Rules and groups.** Names and groups follow CKEditor (`oneQuarter` is
CKEditor's `oneForth`); the `misc` group holds Tiptap-only rules and is not in
the default selection.

| Group | Rule | Typed | Result | When |
|---|---|---|---|---|
| `typography` | `ellipsis` | `...` | `…` | on the third `.` |
| | `enDash` | ` -- ` | ` – ` | on the space; `--` must follow whitespace or the block start |
| | `emDash` | ` --- ` | ` — ` | same |
| `quotes` | `quotesPrimary` | `"` | opening/closing double quote | on `"` |
| | `quotesSecondary` | `'` | opening/closing single quote or `’` | on `'` |
| `symbols` | `copyright` / `registeredTrademark` / `trademark` | `(c)` `(r)` `(tm)` | `©` `®` `™` | on `)` (lowercase only) |
| `mathematical` | `oneHalf` `oneThird` `twoThirds` `oneQuarter` `threeQuarters` | ` 1/2 ` … ` 3/4 ` | `½` `⅓` `⅔` `¼` `¾` | on the space, delimited like dashes |
| | `lessThanOrEqual` / `greaterThanOrEqual` / `notEqual` | `<=` `>=` `!=` | `≤` `≥` `≠` | on `=` |
| | `arrowLeft` / `arrowRight` | ` <- ` ` -> ` | `←` `→` | on the space, delimited |
| `misc` (opt-in) | `servicemark` `plusMinus` `laquo` `raquo` `superscriptTwo` `superscriptThree` | `(sm)` `+/-` `<<` `>>` `^2` `^3` | `℠` `±` `«` `»` `²` `³` | on the last character |

Delimited rules keep the typed space and never fire inside a word (`11/2 `,
`x-> `, `a--` stay literal). Tiptap's undelimited `--` → `—`, `->` → `→` and
`2x3` → `2×3` are deliberately not offered: they rewrite command lines, code
spans and Markdown markers mid-word. A `--- ` that occupies a whole paragraph is
still a horizontal rule when `markdown-v1` is also selected, because Markdown
recognition runs first; then autolink, then typography.

**Quotes.** A quote opens at the block start or after whitespace, `( [ { <`,
a dash, `/` or another opening quote, looking through typed `*`, `_`, `~` and
`` ` `` markers (so `*"a"*` becomes `*“a”*`); otherwise it closes. A `'` after
a letter or digit is the apostrophe `’` (`it’s`, `l’ami`), unless the style's
closing single quote differs from `’` and an opening single quote is still
open in the block (German `‚so‘`). Styles:

| `quotes` | Double | Single |
|---|---|---|
| `english` (default) | “ ” | ‘ ’ |
| `german` | „ “ | ‚ ‘ |
| `french` | « » with U+00A0 inside | ‹ › with U+00A0 inside |
| `swiss` | « » | ‹ › |
| `polish` | „ ” | ‚ ’ |
| custom | `{"double":[o,c],"single":[o,c],"space"?:"nbsp"\|"narrow-nbsp"}` | |

Custom quote characters must each be one non-ASCII, non-whitespace, non-control
scalar. Known limitations: a leading elision (`'90s`) gets an opening quote
(as in Tiptap and CKEditor); a closing quote typed after a space is treated as
opening; there is no RTL quote swap (Tiptap's `rtl` option) — configure a
custom pair instead.

**Selection.** `include` (groups or rule names) replaces the default groups
`typography`, `quotes`, `symbols` and `mathematical`; `exclude` then removes
groups or rules. Unknown names, a name repeated in one list, more than 64
names, an empty result, an unknown preset or an unsafe custom quote reject the
whole selection before the editor mounts (browser) or before any input commits
(Wasm). CKEditor's `extra` custom from/to rules are not supported.

**History, formats and exclusions.** The typed trigger is retained first
through the ordinary typing path. The replacement is then one isolated native
group, `Delete` of the recognized characters plus `Insert` of the result:
one Undo restores exactly the typed characters (with the caret after them),
Redo reapplies it, and the following input is ordinary. The inserted text
carries exactly the formats of the last replaced character, and the pending
formats at the caret are unchanged, so bold typing stays bold. No conversion
inside code blocks or when any inline-code run touches the replaced range or
trigger, at a non-collapsed selection, in read-only owners, or when the
recognition window floor (see below) would hide the context a rule needs.

**Local and shared.** `RichLocalSession` dispatches the captured
`DeleteText` + `InsertText` actions. `RichReplica` lowers the same native plan
to original guarded commands — `delete_text`, `insert_text` and `set_format`
annotations over the inserted range (removing every block format kind that is
not wanted and setting each wanted one, exactly like ordinary shared typing) —
and adopts the result only when it equals the native preview. Peers receive
ordinary edits; checkpoints, recovery families and saved formats are
unchanged, and no recognition is replayed.

**API.** Rust: `RichInputRuleSet::TYPOGRAPHY_V1` (defaults),
`RichInputRuleSet::typography_with(RichTypographyConfig)`,
`RichTypographyConfig::try_new(include, exclude, RichQuoteStyle)`,
`RichQuoteStyle::{ENGLISH, GERMAN, FRENCH, SWISS, POLISH, preset, try_new}`,
`RichTypographyRequest` (the strict JSON shape) and the pure
`rich_typography_replacement`. Wasm: `typographyInputRulesVersion()` /
`typography_input_rules_version()` string `1`; the existing rule-set calls
accept `"typography-v1"` in `rules` (now up to three ids) and an optional
`typography` object (`include`, `exclude`, `quotes`), which is rejected
without `typography-v1`. SDKs: `supportsTypographyInputRules()` and an
optional trailing `typography` argument on `insertPlainTextWithInputRules` /
`insertTypingTextWithInputRules`.

Browser owners select it with `inputRules: "typography-v1"` (defaults) or a
configured entry `inputRules: {rule: "typography-v1", include?, exclude?,
quotes?}`, alone or in a list with `markdown-v1`/`autolink-v1` (local and
shared DOM options, SDK openers and React `initialOptions`). The browser
validates the same names and quote rules at mount (`TYPOGRAPHY_RULE_GROUPS`
mirrors the native table) and requires the typography capability; native code
validates again.

## Planning and admission

`plan_rich_markdown_input_rule(context, document, selection, trigger, namespace)`
returns no match or an opaque `RichInputRulePlan`. A plan retains the exact source
tree and binding, matched kind, stable block identity, scalar-aligned UTF-16
steps, fully admitted candidate and resulting caret. It is a pure read. Cloned
steps or a preview are not owner, writer or permission authority.

Recognition crosses formatting-run boundaries in one block, never joins blocks
or searches DOM text. It retains at most the last 4,096 UTF-16 units for inline
recognition and refuses a source block with more than 8,192 runs. The window floor
advances past a split surrogate. A block rule needs the full prefix, and an
inline opener at a truncated window boundary is not invented. A match spanning
outside that declared recognition window remains literal. Exceeding the run
inspection ceiling is an explicit error. These recognition limits do not bound
independent selection/schema admission and are not a measured latency or
total-heap guarantee.

Every dependent action is captured against its preceding private admitted
snapshot. The complete group and resulting caret are checked again under the
receiving limits before publication. Existing transaction, schema, document,
history, journal and transport ceilings are unchanged.

The host supplies a permanently fresh namespace of at most 90 valid content-ID
bytes. Native planning derives only the required wrapper/item/rule identities.
Unused namespaces are not validated for a nonmatch. Visible collisions reject;
shared preparation additionally rejects historical identity reuse, including
after Undo. A namespace is not a new room, writer, merge clock or permission.

## Local and shared history

`RichLocalSession::apply_markdown_input_rule` checks its exact observation and
current writable policy before planning. It dispatches the captured ordinary
action group with an explicit resulting caret/pending state. Local checkpoints
record admitted forward/inverse edits, not trigger recognition.

`RichReplica::apply_markdown_input_rule_guarded` uses the same pure native plan.
It lowers the steps only into existing guarded causal commands: source-character
deletions, kind changes, retained-body wrappers, rule insertion and original
format annotations. A staged candidate must equal the native preview before
adoption. The original command union, model/journal versions, protocol defaults
and existing original/general/document, natural, reviewed and search save
families retain their meanings. There is no input-rule history upgrade or
automatic migration.

A nonmatch leaves source, local UI and history unchanged and retains Redo,
observation tokens and any open typing continuation. Stale/foreign observations, read-only
policy, reused identities, resource exhaustion and late admission failures reject
without partial marker deletion. Selective shared Undo preserves peer characters;
the existing causal placement limitations still apply after concurrent
deletion/Undo/Redo.

## Remaining functionality and qualification

Both official candidate profiles require current-runtime DOM/root/React and
independent installed input-rule checks. The
[candidate pipeline checkpoint](qualification/2026-10-18-input-rules-candidate-pipeline.json)
records their local execution, 472 passing script contracts and 376 editor tests,
plus the retained failed runner configurations and same-source continuation.
Hosted CI and the complete candidate profiles remain unqualified.

`node scripts/check-input-rules-installed.mjs --current-runtime-only` rebuilds
the producer and verifies fresh installed packages without historical caches.
It explicitly defers the three pinned-reader proof classes, uses null historical
digests and writes `target/input-rules-current-installed-consumer.json`.
The default checker still requires the independently pinned earlier/prior SDK
runtime pairs and writes its separate full-reference report. Missing references
never select the portable scope automatically. `--reuse-runtimes` is a separately
recorded development mode; neither candidate profile selects it.

Existing-list task conversion, backward adjacent-list joining and conventional
code Enter are implemented (see above) with native, causal, Wasm and real-key
browser tests; the deliberately literal cases listed there remain literal. Final input, browser,
performance, storage, compatibility and release qualification remain part of the
V1 goal. Synthetic composition and DOM tests do not qualify an OS input method,
native clipboard, screen reader or the historical intermittent WebKit fault.
