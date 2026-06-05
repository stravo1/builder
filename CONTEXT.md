# Builder

Domain vocabulary for the Frappe Builder app. This document captures editor concepts only — not implementation details.

## Editor extensions

**Plugin**:
An editor-time extension that runs while designing a page in Page Builder. Plugins read and mutate the block tree, selection, and canvas viewport through a sandboxed runtime. Distinct from block client scripts, components, and block templates.
_Avoid_: using "plugin" for published-page runtime scripts

**Plugin Host**:
The main-thread runtime in Page Builder that loads plugin code, manages the QuickJS sandbox, validates API calls, and coordinates the plugin UI iframe.

**Plugin API**:
The stable, versioned surface exposed to plugins (`PluginBlock`, canvas commands, selection, viewport, history batching). Plugins never receive internal reactive `Block` instances.

**Block client script**:
User-provided JavaScript attached to a block that runs on published pages. Executed via the existing Proxy sandbox in the editor preview and at runtime — not via the plugin system.

## Relationships

- A **Plugin** runs inside the **Plugin Host** and calls the **Plugin API**
- A **Block client script** belongs to a single block and runs at page runtime
- **Plugins** are installed as `Builder Plugin` records and/or loaded from a local dev folder
