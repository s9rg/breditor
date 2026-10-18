# Native input rules

Breditor input rules recognize bounded typed shortcuts and prepare ordinary native
edits. They are an explicit behavior policy, not a Markdown parser, document
format, operation protocol or replacement for semantic toolbar commands.

The Rust planner and local/shared application methods implement the first native
policy. Wasm/SDK exposure, browser opt-in, installed acceptance and additional
shortcut behavior remain work before this becomes an integrated V1 feature.
Existing typing, paste, composition, programmatic commands and recovery do not
enable it implicitly.

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

The browser adapter must invoke this policy only for the selected local plain
typing path, not paste, autocorrection/replacement, remote updates, composition,
grid/node/document replacement or a browser target different from the admitted
caret. It must use the same command coordinator and remote holds, and check a
fresh post-input native observation before applying the transformation. This
adapter integration is not implemented by the native methods alone.
The automatic path must keep literal insertion and optional transformation in
one native call before host callbacks can change the target. It needs an explicit
accepted-input/rule-refused outcome when literal typing succeeds but conversion
fails, not a false whole-call rollback or a repeated insertion. That composite
native intent still needs implementation before Wasm/SDK exposure.

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
headings and ordinary lists. Captions do not accept structural shortcuts. A
required first paragraph/heading in a list or task item may change heading rank,
but is not replaced by a wrapper or code block. Later flow paragraphs can be
wrapped normally. Conversion of an existing list item into a task, adjacent-list
joining and nested automatic shortcuts are follow-up functionality; the policy
does not flatten retained item bodies to approximate them.

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
delimiter interpretation, URL autolinking, smart punctuation and arbitrary
host-defined patterns are not implied by this first native policy.

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

## Integration still required

Complete the optional Wasm and SDK capability, explicit vanilla/React startup
selection, composition/queue/remote boundaries and independent installed
workflow tests. Continue the additional shortcut cases above without changing
existing saved recipe meanings. Final input, browser, performance, storage,
compatibility and release qualification remain part of the V1 goal.
