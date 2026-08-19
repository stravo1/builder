/**
 * The transient dialog (1.15).
 *
 * The host owns the chrome, so every extension dialog looks the same, and the
 * extension owns only the document inside it.
 *
 * `openDialog` and `closeDialog` arrive on different frames' ports: one frame
 * asks, and the frame the host then opens answers. 1.15 says to correlate them
 * by request id, because the host cannot tell which frame called. As built the
 * key is the extension, because an extension has one dialog at a time — the same
 * limit that lets `setHeight` work without knowing its caller.
 *
 * This module holds Vue state that a component renders, which no other method
 * file does. A dialog is the one thing an extension asks for that the host has
 * to draw somewhere, and `ExtensionHost.vue` is where that happens.
 */

import { markRaw, reactive } from "vue";
import { bridge } from "../host/bridge";
import type { MethodTable } from "../host/capabilities";
import { fields, optionalText, refuse } from "../params";
import type { InstalledExtension } from "../types";

/** Wide enough for a picker, narrow enough to stay a dialog. */
const WIDTH = { min: 280, max: 900, fallback: 480 };
const HEIGHT = { min: 120, max: 720 };

export type OpenDialog = {
	title: string;
	width: number;
	height: number | null;
	/**
	 * Travels to the dialog frame at its connect handshake (B1).
	 *
	 * Raw, never reactive. The handshake is a `postMessage`, which clones what it
	 * sends, and a Vue proxy cannot be cloned. These are plain JSON off the wire
	 * and never change while the dialog is open, so there is nothing to observe.
	 */
	props: Record<string, unknown>;
};

/** Read by `ExtensionHost.vue`. Reactive, because opening one has to paint. */
export const openDialogs = reactive(new Map<string, OpenDialog>());

/** Kept out of the reactive map: a resolver is not state anything renders. */
const waiting = new Map<string, (result: unknown) => void>();

/** Which extensions already have a teardown hook, so opening twice adds one hook. */
const hooked = new Set<string>();

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
	Math.min(Math.max(value, min), max);

const number = (value: unknown, name: string) => {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw refuse(`"${name}" must be a number.`, "invalid_params");
	}
	return value;
};

/**
 * Settles whoever is waiting, and forgets the dialog.
 *
 * One function for all three endings — the dialog closed itself, the user
 * dismissed it, or the extension was torn down — because a pending call that
 * never settles is a frame waiting forever.
 */
const settle = (extension: string, result: unknown) => {
	waiting.get(extension)?.(result);
	waiting.delete(extension);
	openDialogs.delete(extension);
};

/** The host does this itself when the user presses Escape or clicks outside (1.15). */
export const dismissDialog = (extension: string) => settle(extension, undefined);

/**
 * A second call replaces the first (1.15). The first one's caller is settled with
 * nothing, rather than left pending against a dialog that is gone.
 */
const openDialog = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	const dialog: OpenDialog = {
		title: optionalText(sent.title, "title") ?? extension.label,
		width: clamp(number(sent.width, "width") ?? WIDTH.fallback, WIDTH),
		height: null,
		props: markRaw(fields(sent.props)),
	};

	settle(extension.name, undefined);
	openDialogs.set(extension.name, dialog);

	if (!hooked.has(extension.name)) {
		hooked.add(extension.name);
		bridge.onTeardown(extension.name, () => {
			settle(extension.name, undefined);
			hooked.delete(extension.name);
		});
	}

	return new Promise((resolve) => waiting.set(extension.name, resolve));
};

const closeDialog = (params: unknown, extension: InstalledExtension) => {
	if (!openDialogs.has(extension.name)) {
		throw refuse(`"${extension.name}" has no open dialog to close.`, "unknown_item");
	}
	settle(extension.name, fields(params).result);
};

const setHeight = (params: unknown, extension: InstalledExtension) => {
	const dialog = openDialogs.get(extension.name);
	if (!dialog) throw refuse(`"${extension.name}" has no open dialog to resize.`, "unknown_item");

	const height = number(fields(params).height, "height");
	if (height === undefined) throw refuse(`"height" is required.`, "invalid_params");
	dialog.height = clamp(height, HEIGHT);
};

export const uiMethods: MethodTable = {
	// a modal covers the editor, so it is the intrusive case (1.7)
	"ui.openDialog": { needs: "ui.dialog", run: openDialog },
	"ui.closeDialog": { needs: "ui.dialog", run: closeDialog },
	"ui.setHeight": { needs: "ui.dialog", run: setHeight },
};
