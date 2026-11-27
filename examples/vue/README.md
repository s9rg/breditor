# Breditor Vue 3 example

`src/BreditorVueEditor.ts` is a Vue 3 component around `openLocalEditor`. It is
written with `defineComponent` and render functions. The example then needs only
the `vue` package, with no single-file-component compiler plugin. The same `setup()`
body works unchanged inside a `.vue` file.

```ts
h(BreditorVueEditor, {
  key: documentId,                // A new key is the only way to open another document.
  documentJson: seed,             // Initial, read once per instance.
  readOnly: readOnly.value,       // Live: applied with setReadOnly, never a re-mount.
  onReady: editor => {},
  onChange: (view, outcome) => {},
  onError: error => {},
});
```

What the demo shows:

- **Mount** opens on the component's own host `<div>`, which Vue never renders children
  into. `ready` is emitted once per owner.
- **Prop updates.** `readOnly` goes through `setReadOnly` on the same owner. A value that
  changes during startup is applied once the owner is ready. `documentJson` and `label`
  are initial, so the demo changes `:key` to open another document.
- **Unmount** (`v-if`, a key change or app unmount) aborts a pending opening or disposes
  the live owner. A late resolution after unmount is disposed and never emitted, and
  cancellation is never reported as an error.
- **Dev double mount and HMR.** Vue does not double-invoke hooks the way React StrictMode
  does. The equivalent risks are a fast unmount/mount ("Remount during startup") and Vite
  HMR. `main.ts` unmounts the old app in `import.meta.hot.dispose` before the updated
  module mounts a new one. Each component instance has its own host element, so a
  remount never contends for a claimed host.
- Never store a `LocalEditor` in `ref()` or `reactive()`. The owner has private fields,
  and a Vue proxy would break them. Keep it in a plain variable, `shallowRef` or
  `markRaw`.

## Run

```sh
npm run build:examples:frameworks
npm run dev:example --workspace @breditor/example-vue
```

## Dependency and license note

This example adds one dev dependency, `vue@3.5.43`, declared only in this example's
`package.json`. It is not a dependency of any published Breditor package. Vue and its
`@vue/*` packages are MIT-licensed. Through `@vue/compiler-sfc` and
`@vue/compiler-core`, npm also installs `@babel/parser`, `@babel/types` and its two
helper packages, `magic-string` and `estree-walker` (all MIT). It also installs
`entities` (BSD-2-Clause). The production bundle includes only `@vue/runtime-dom`,
`@vue/runtime-core`, `@vue/reactivity` and `@vue/shared`, all MIT. The version is pinned
below 3.5.44 because later releases require a newer `postcss` than the workspace's
locked Vite toolchain uses, and this example should not change shared tooling.
