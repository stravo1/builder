# frappe-builder-extension-sdk

The package a Builder extension author installs. It gives you the types, the Vue
helpers, and the Vite plugin that builds an extension.

## Install

```sh
npm install --save-dev frappe-builder-extension-sdk
```

## Two halves

The SDK has a runtime half and an author half.

Builder serves the runtime half at `/builder_extension_asset/sdk/extension-sdk.js`.
Every extension frame loads that one module through an import map. Your build
never bundles it.

This package is the author half. It holds the Vite plugin, the Vue helpers, and
the types your editor reads.

## Build an extension

Point Vite at the plugin. Give it the origin that serves Builder.

```js
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import builderExtension from "frappe-builder-extension-sdk/vite";

export default defineConfig({
	plugins: [vue(), builderExtension({ builderUrl: "http://builder.localhost:8000" })],
});
```

The plugin needs a `manifest.json` beside the config, and an entry at
`src/main.js` or `src/main.ts`.

## Write against the editor

```js
import builder from "frappe-builder-extension-sdk";

builder.actions.register("say-hello", () => builder.ui.toast("hello"));
```

A Vue slot uses the `/vue` entry.

```js
import { defineSlot, useBuilderContext } from "frappe-builder-extension-sdk/vue";
```

`vue` is an optional peer dependency. Install it only if you write slots in Vue.

## Versions

The major version of this package is the protocol version it speaks. Version
`1.x` works with any Builder that serves protocol 1. A Builder on a later
protocol needs the matching major version.

## License

AGPL-3.0-only
