# Third-party notices for `@breditor/wasm`

This is the reviewed production dependency inventory for the locked
`breditor-wasm` Cargo graph on `wasm32-unknown-unknown`. It is generated from
`cargo metadata --locked --filter-platform wasm32-unknown-unknown` and includes every
reachable normal and build dependency. Development-only dependencies are not
part of the published Wasm module and are excluded. The release check compares
this file, the package set, every edge below, Cargo's license metadata, and the
required notice bytes before replacing `dist`.

The workspace crates `breditor-wasm` and `breditor-core` are first-party.
The locked third-party package inventory is:

- `bumpalo 3.20.3` — Cargo license expression: `MIT OR Apache-2.0`
- `cfg-if 1.0.4` — Cargo license expression: `MIT OR Apache-2.0`
- `itoa 1.0.18` — Cargo license expression: `MIT OR Apache-2.0`
- `memchr 2.8.3` — Cargo license expression: `Unlicense OR MIT`
- `once_cell 1.21.4` — Cargo license expression: `MIT OR Apache-2.0`
- `proc-macro2 1.0.107` — Cargo license expression: `MIT OR Apache-2.0`
- `quote 1.0.47` — Cargo license expression: `MIT OR Apache-2.0`
- `rustversion 1.0.23` — Cargo license expression: `MIT OR Apache-2.0`
- `serde 1.0.229` — Cargo license expression: `MIT OR Apache-2.0`
- `serde_core 1.0.229` — Cargo license expression: `MIT OR Apache-2.0`
- `serde_derive 1.0.229` — Cargo license expression: `MIT OR Apache-2.0`
- `serde_json 1.0.151` — Cargo license expression: `MIT OR Apache-2.0`
- `syn 2.0.119` — Cargo license expression: `MIT OR Apache-2.0`
- `syn 3.0.4` — Cargo license expression: `MIT OR Apache-2.0`
- `thiserror 2.0.20` — Cargo license expression: `MIT OR Apache-2.0`
- `thiserror-impl 2.0.20` — Cargo license expression: `MIT OR Apache-2.0`
- `unicode-ident 1.0.24` — Cargo license expression: `(MIT OR Apache-2.0) AND Unicode-3.0`
- `unicode-segmentation 1.13.3` — Cargo license expression: `MIT OR Apache-2.0`
- `wasm-bindgen 0.2.127` — Cargo license expression: `MIT OR Apache-2.0`
- `wasm-bindgen-macro 0.2.127` — Cargo license expression: `MIT OR Apache-2.0`
- `wasm-bindgen-macro-support 0.2.127` — Cargo license expression: `MIT OR Apache-2.0`
- `wasm-bindgen-shared 0.2.127` — Cargo license expression: `MIT OR Apache-2.0`
- `zmij 1.0.23` — Cargo license expression: `MIT`

For dependencies offering MIT or Apache-2.0, this distribution selects
Apache-2.0 unless a selection is stated below; the package root contains the
Apache-2.0 text. The additional exact texts shipped in `third-party/` are:

- `memchr 2.8.3`: Unlicense, selected from `Unlicense OR MIT`
- `unicode-ident 1.0.24`: Apache-2.0 plus the mandatory Unicode-3.0 license
- `unicode-segmentation 1.13.3`: upstream `COPYRIGHT` notice
- `zmij 1.0.23`: upstream MIT license

The compiled module also contains code from the Rust standard library. The
official Rust 1.98.0 `COPYRIGHT-library.html` is copied from the pinned
toolchain into `dist/third-party/rust-1.98.0/` during every package
build and is byte-locked by the release check.

## Locked normal/build dependency edges

- `breditor-core@workspace -> serde@1.0.229 [normal]`
- `breditor-core@workspace -> serde_json@1.0.151 [normal]`
- `breditor-core@workspace -> thiserror@2.0.20 [normal]`
- `breditor-core@workspace -> unicode-segmentation@1.13.3 [normal]`
- `breditor-wasm@workspace -> breditor-core@workspace [normal]`
- `breditor-wasm@workspace -> serde_json@1.0.151 [normal]`
- `breditor-wasm@workspace -> wasm-bindgen@0.2.127 [normal]`
- `proc-macro2@1.0.107 -> unicode-ident@1.0.24 [normal]`
- `quote@1.0.47 -> proc-macro2@1.0.107 [normal]`
- `serde@1.0.229 -> serde_core@1.0.229 [normal]`
- `serde@1.0.229 -> serde_derive@1.0.229 [normal]`
- `serde_derive@1.0.229 -> proc-macro2@1.0.107 [normal]`
- `serde_derive@1.0.229 -> quote@1.0.47 [normal]`
- `serde_derive@1.0.229 -> syn@3.0.4 [normal]`
- `serde_json@1.0.151 -> itoa@1.0.18 [normal]`
- `serde_json@1.0.151 -> memchr@2.8.3 [normal]`
- `serde_json@1.0.151 -> serde_core@1.0.229 [normal]`
- `serde_json@1.0.151 -> zmij@1.0.23 [normal]`
- `syn@2.0.119 -> proc-macro2@1.0.107 [normal]`
- `syn@2.0.119 -> quote@1.0.47 [normal]`
- `syn@2.0.119 -> unicode-ident@1.0.24 [normal]`
- `syn@3.0.4 -> proc-macro2@1.0.107 [normal]`
- `syn@3.0.4 -> quote@1.0.47 [normal]`
- `syn@3.0.4 -> unicode-ident@1.0.24 [normal]`
- `thiserror-impl@2.0.20 -> proc-macro2@1.0.107 [normal]`
- `thiserror-impl@2.0.20 -> quote@1.0.47 [normal]`
- `thiserror-impl@2.0.20 -> syn@3.0.4 [normal]`
- `thiserror@2.0.20 -> thiserror-impl@2.0.20 [normal]`
- `wasm-bindgen-macro-support@0.2.127 -> bumpalo@3.20.3 [normal]`
- `wasm-bindgen-macro-support@0.2.127 -> proc-macro2@1.0.107 [normal]`
- `wasm-bindgen-macro-support@0.2.127 -> quote@1.0.47 [normal]`
- `wasm-bindgen-macro-support@0.2.127 -> syn@2.0.119 [normal]`
- `wasm-bindgen-macro-support@0.2.127 -> wasm-bindgen-shared@0.2.127 [normal]`
- `wasm-bindgen-macro@0.2.127 -> quote@1.0.47 [normal]`
- `wasm-bindgen-macro@0.2.127 -> wasm-bindgen-macro-support@0.2.127 [normal]`
- `wasm-bindgen-shared@0.2.127 -> unicode-ident@1.0.24 [normal]`
- `wasm-bindgen@0.2.127 -> cfg-if@1.0.4 [normal]`
- `wasm-bindgen@0.2.127 -> once_cell@1.21.4 [normal]`
- `wasm-bindgen@0.2.127 -> rustversion@1.0.23 [build]`
- `wasm-bindgen@0.2.127 -> wasm-bindgen-macro@0.2.127 [normal]`
- `wasm-bindgen@0.2.127 -> wasm-bindgen-shared@0.2.127 [normal]`
