# Installed native Safari typing history, November 24, 2026

The installed vanilla editor ran on native Safari 26.6.2 with macOS 26.6.2,
an Apple M1 Pro (`arm64`), and 32 GiB of memory. The clean build used source
`23b54a0418b2e815e1cade289e253cc62eec13cc` and Node 22.14.0.
`node scripts/check-editor-package.mjs` built the browser fixture from the
independently installed archives. The local production page used its explicit
`?history=typing` entry and a disposable loopback origin.

## Observed through native Safari

1. Option-Tab moved focus through **Save exact session**, the file input, the
   table insertion button, the editor, and the first cell selection button.
   Safari's accessibility tree named the editor and formatting toolbar and
   exposed the heading, table, image, and nested list.
2. Keyboard navigation returned focus to the editor. The native pasteboard
   inserted `Safari checkpoint A ` before `SDK heading`. Safari exposed the
   edited level-2 heading and enabled Undo.
3. Command-Z and Command-Shift-Z alternated between the original and edited
   headings twice. Undo disabled at the original state and Redo disabled at
   the edited state.
4. Option-Shift-Tab reached **Save exact session**. Return saved the session.
   Command-R reopened with the edited heading and Undo enabled. Returning to
   the editor with the keyboard verified the same Undo and Redo text states
   after reload. The table cell `a🙂b` and nested list item `Nested idea`
   remained visible in both states.

These observations use native Safari keyboard actions, the system pasteboard,
and the browser accessibility tree. The recorded evidence covers visible text,
structure, focus, and history controls. VoiceOver speech, physical IME,
mobile input, and the historical intermittent engine faults remain separate
qualification work.

## Installed byte identities

All archives were version `0.3.0-alpha.22` and were rehashed after the check.

- `@breditor/browser` · `1199d14fe5b3d5b2e0318642a9bbf9f5b84773e97265597f72e190be43869ae0`
- `@breditor/experimental-rich-content` · `b0333bd0c8a68897eeea5370c6be256ea63c1fea4b1a06559f83b6a5b934d005`
- `@breditor/collaboration` · `6af6292ed18edc7cd060673f5865c26ed3ba85e7cf0e4b8437840ba607ad849f`
- `@breditor/editor` · `9091ec60bb7ab80ddbdfcdfa5cde8756fdf33b16a16e1d78d792151c0db49b08`

The production fixture HTML SHA-256 was
`916556b35772b74f9f712ebe4656d56dfe95bf601d52ee1990c5db71ffd92bf1`.
The bundled local Wasm SHA-256 was
`f100599f39805586d465961161bf751e0bd51e8d524ad2ab653001946347200e`.
