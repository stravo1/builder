/**
 * The `.` entry: types only, in practice.
 *
 * No build ever reads this file. `vite.js` marks `@builder/extension-sdk`
 * external, so the specifier survives into the output and the frame shell's
 * import map resolves it to the one instance Builder serves. In a dev server the
 * plugin rewrites the same specifier to an absolute URL on the Builder origin,
 * which is that same instance again.
 *
 * It exists so an author's editor and type checker can follow the import.
 */

export { default, type HostInfo } from "../src/extensions/sdk/index";
export type {
	BlockPatch,
	Control,
	ControlName,
	ContextField,
	ContextHandler,
	ContextMenuRegistration,
	ExtensionToken,
	ItemPatch,
	LeftPanelRegistration,
	NewBlock,
	PropertiesRegistration,
	SettingsRegistration,
	ShowWhen,
	SlotLoader,
	ToolbarRegistration,
} from "../src/extensions/sdk/namespaces";
export type { FrameOptions } from "../src/extensions/sdk/ui";
export type { SlotEntry } from "../src/extensions/sdk/slots";
export type { Breakpoint, EditorContext, EditorSelection } from "../src/extensions/types";
