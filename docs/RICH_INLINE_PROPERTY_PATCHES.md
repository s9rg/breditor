# Rich inline property patches

Property patches change explicitly named fields while retaining each selected
run's other observed fields and unrelated format kinds. This allows a URL-only
edit across links with different targets, or a target-only edit across different
URLs. Rust plans and admits the resulting values; JavaScript does not rewrite
the document AST or invent replicated operations.

## Values and admission

`RichFormatPropertyPatch::try_new(template, properties)` captures one complete
typed `Format` template and a nonempty list of distinct qualified property names.
Each name must exist in the template. Applying the patch copies only those fields
into an existing format of the same kind. Every selected character must carry
that format. Missing formats reject the entire intent instead of creating
partially specified links, skipping plain characters or selecting an arbitrary
mixed value. Removing a format remains a distinct remove action.

The public Rust value is not admission proof. Local publication validates the
complete resulting document under the active schema and budgets. Wasm and shared
JSON entry points also admit the complete template using the existing strict
format codec, including duplicate-property and typed-value checks. Unknown fields,
duplicate kinds or fields, invalid scalar boundaries and stale observations fail
without content, selection, pending-format or history publication.

## Local commands

`SetInlineFormat::capture_changes` accepts
`RichFormatChange::Patch(RichFormatPropertyPatch)`. It constructs each final run
once, alongside other changes to distinct kinds, then uses the existing guarded
node patch and exact inverse. A patch and set/remove of the same kind cannot
appear in one compound request.

```js
editor.execute({kind: 'changeInlineFormats', data: {
  changes: [{
    kind: 'patch',
    formatsJson: JSON.stringify([{
      type: 'breditor-inline/link',
      properties: {
        'breditor-inline/href': 'https://example.test/new',
        'breditor-inline/new-window': false
      }
    }]),
    properties: ['breditor-inline/href']
  }],
  targets: [{block: 'p', start: '0', end: '4'}]
}});
```

The template's `new-window` value is not applied by that request. Each existing
target is retained. Local targets use decimal UTF-16 offsets and unique blocks;
the active action ceiling remains unchanged. The original `setInlineFormat`
request remains set/remove-only. `inlineControlsVersion()` still returns `1`;
the separate native `inlinePropertyPatchesVersion()` returns `1`, surfaced as
`core.supportsInlinePropertyPatches()` by the facade.

## Shared commands and conflict policy

```js
core.patchInlineFormatProperties({
  format: {
    type: 'breditor-inline/link',
    properties: {
      'breditor-inline/href': 'https://example.test/new',
      'breditor-inline/new-window': false
    }
  },
  properties: ['breditor-inline/href'],
  targets: [{block: 'p', offset: 0, length: 4}]
}, core.view().revision);
```

The native method checks the opaque publication observation before decoding and
planning. It admits one template, inspects current source runs, coalesces adjacent
equal changed results and lowers them into existing `Command::SetFormat` values.
One guarded dispatch creates one author-local history group. Unchanged intervals
author no annotation. A fully unchanged request retains its exact observation,
checkpoint and Redo branch. The request is bounded to 64 KiB, unique block targets
and the existing 64-command group ceiling after coalescing; no partial result or
automatic batching is published when a limit fails.

No patch command is persisted in a journal, update frame or writer group. Model
11/journal 12 and model 12/journal 13 keep their existing meanings and defaults.
The result remains a complete-format annotation under the original causal
priority rules. A patch preserves fields observed by its author; two concurrent
patches to different properties of the same format are not independent registers
and may select one complete value. Changing that policy requires a separate
versioned replication design. Selective Undo removes only the author's owned
annotations and preserves another author's text and unrelated formats.

## Toolbar behavior

On mixed links, blank URL means keep each existing URL and blank target means
keep each existing target. At least one field must be supplied, and a field-only
patch requires all selected characters to be linked. Supplying both fields uses
the existing complete set command, including when creating links over plain text.
URL validation retains the credential-free absolute HTTP(S) policy. Unlink is
the explicit removal control. Color and size commands already preserve unrelated
format kinds; their one-property formats do not require a partial map operation.

Dirty forms retain the original revision guard. A content, selection, typing or
history publication makes the draft stale; applying never silently retargets it.
The patch is a separate native capability. An older matching owner still supports
its original controls but rejects a requested patch without a JavaScript fallback.
