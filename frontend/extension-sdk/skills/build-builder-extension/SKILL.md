---
name: build-builder-extension
description: Build, run, and install a Frappe Builder extension — toolbar buttons, context menu rows, property sections, left panel tabs, settings pages, dialogs, and popovers, through frappe-builder-extension-sdk. Use when the user asks for a Builder extension, a Builder plugin, or a Builder component, or wants to add a surface to the Builder editor.
---

# Build a Builder extension

An extension adds surfaces to the Frappe Builder editor. It runs in a sandboxed frame and
reaches the editor only through `frappe-builder-extension-sdk`.

Read `references/extension-api.md` before you write any code. It holds the whole API: the
capability list, every surface, the error codes, and the rules the host enforces. This file
holds the workflow only.

## Before you start

Ask the user for two facts, if the request does not carry them:

1. The Builder origin, for example `http://builder.localhost:8080`.
2. What the user does with the feature, and what editor data it needs.

Search the target project for an existing extension first. Reuse its manifest, build setup,
and naming.

## Create the project

1. Make `manifest.json`, `package.json`, `vite.config.js`, and `src/main.ts`.
2. Install the SDK: `npm install --save-dev frappe-builder-extension-sdk`. The package is
   not on npm yet, so until it lands, install it from git:
   `npm install --save-dev github:stravo1/frappe-builder-extension-sdk`.
3. Install `vite`, `vue`, and `@vitejs/plugin-vue` when the feature needs a frame.
4. Add `builderExtension({ builderUrl })` to the Vite plugin list.

```js
import vue from "@vitejs/plugin-vue";
import builderExtension from "frappe-builder-extension-sdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), builderExtension({ builderUrl: "http://builder.localhost:8080" })],
});
```

`builderUrl` must be the origin that serves the editor. Another origin loads a second SDK
instance, and the frame never connects.

## Choose the surface

Choose the smallest surface that meets the request:

| The user wants | Use |
|---|---|
| One command | A toolbar button or a context menu row, with an action |
| To edit values on a block | A property section with bound controls |
| A list, a browser, or a form | A left panel tab, a dialog, or a popover |
| Settings for the extension | One settings page |

A host-rendered surface uses Builder's own components. Open a frame only when the feature
needs custom content.

## Write the entry

Put every registration at module scope. Every frame of the extension reads the same module,
and the SDK sends the declarations from the hidden main frame only.

Register an action before the surface that names it. Put startup work in `builder.main`.

Request only the capabilities the code uses. Map each protected call to its capability with
the table in `references/extension-api.md`.

## Run it

1. Run `npm run dev` in the extension directory.
2. Open Builder in developer mode.
3. Choose `Load Dev extension` from the main menu.
4. Paste any URL from the Vite dev server.

Builder holds one development extension per session, and a reload drops it.

## Install it on a site

Builder has no install API yet. Use `install_extension.py`, which ships with the SDK:

```sh
npm run build
cd /path/to/bench/sites
../env/bin/python \
  /path/to/my-extension/node_modules/frappe-builder-extension-sdk/install_extension.py \
  builder.localhost /path/to/my-extension
```

Run it again after every build.

## Check the result

1. Build the extension and fix every TypeScript and Vite error.
2. Open each surface in the editor.
3. Test the read-only page and a multiple-block selection. Both change what a rule matches.
4. Read the browser console. A skipped surface logs a warning that names the method.

## Rules

Do not reach for `window.parent`, Builder stores, or Builder DOM nodes. The sandbox blocks
them, and the API offers no path to them.

Do not bundle the SDK. The Vite plugin keeps it external, and the frame's import map resolves
it to the one instance Builder serves.

Send only plain data through an SDK call. A function, a Vue component, a DOM node, or a class
instance cannot cross the port.

Register one panel, one settings page, one dialog, and one popover at most. A second one
fails with `already_registered`.

Ask for a doctype grant behind a button the user pressed. `data.requestAccess` opens a modal
dialog, so it must never run at startup.
