/**
 * The two frames the host draws for an extension (1.15).
 *
 * The host owns the chrome, so every extension dialog and every popover looks
 * the same, and the extension owns only the document inside it.
 *
 * `open` and `close` arrive on different frames' ports: one frame asks, and the
 * frame the host then opens answers. 1.15 says to correlate them by request id,
 * because the host cannot tell which frame called. As built the key is the
 * extension, because an extension has one of each at a time.
 *
 * A dialog is modal and covers the editor. A popover floats beside it, and the
 * user keeps editing while it stands, so it is the softer of the two and holds
 * its own capability. Both end the same way, and `frameSurface.ts` holds that.
 */

import { toast } from "frappe-ui";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { reactive } from "vue";
import { bridge } from "../host/bridge";
import type { MethodTable } from "../host/capabilities";
import { fields, oneOf, text } from "../params";
import { createFrameSurface, frameSize, type FrameSize } from "./frameSurface";

const dialog = createFrameSurface("dialog");
const popover = createFrameSurface("popover", { sized: true });
const toastTypes = ["success", "error", "warning", "info"] as const;
/** The declared popovers, each with the size its registration asked for. */
export const registeredPopovers = reactive(new Map<string, FrameSize>());

const showToast = (params: unknown) => {
	const values = fields(params);
	const message = text(values.message, "message");
	const type = values.type === undefined ? undefined : oneOf(values.type, toastTypes, "type");

	if (type) return toast[type](message);
	return toast(message);
};

/** Read by `ExtensionDialog.vue` and `ExtensionPopover.vue`. */
export const openDialogs = dialog.open;
export const openPopovers = popover.open;

export const dismissDialog = dialog.dismiss;
export const dismissPopover = popover.dismiss;

const registerPopover = (params: unknown, extension: InstalledExtension) => {
	if (registeredPopovers.has(extension.name)) return;
	registeredPopovers.set(extension.name, frameSize(params));
	bridge.registerTeardown(extension.name, () => registeredPopovers.delete(extension.name));
};

/** Opens the extension's declared popover from Builder chrome, if it has one. */
export const openRegisteredPopover = (extension: InstalledExtension) => {
	const size = registeredPopovers.get(extension.name);
	if (!size) return false;
	void popover.start(size, extension);
	return true;
};

export const uiMethods: MethodTable = {
	// Toasts are rate limited by the bridge, but need no capability: they do not change editor state.
	"ui.toast": { needs: null, run: showToast },
	// a modal covers the editor, so it is the intrusive case (1.7)
	"ui.openDialog": { needs: "ui.dialog", run: dialog.start },
	"ui.closeDialog": { needs: "ui.dialog", run: dialog.finish },
	// A declaration lets Builder chrome offer an extension's popover without guessing.
	"popover.register": { needs: null, run: registerPopover },
	// a popover leaves the editor usable, so it is not the same grant
	"ui.openPopover": { needs: "ui.popover", run: popover.start },
	"ui.closePopover": { needs: "ui.popover", run: popover.finish },
};
