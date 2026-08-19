/**
 * The dialog, from inside a frame (1.15).
 *
 * Two frames are involved and neither knows about the other. One frame asks for
 * a dialog and waits. The host opens the dialog slot's document in a new frame,
 * and that frame calls `closeDialog` when it is done. The host resolves the
 * first frame's pending call with whatever the second one passed.
 *
 * `autoHeight` lives here rather than in the host because the host cannot
 * measure a sandboxed frame at an opaque origin. Only the frame can measure
 * itself, which is also why 1.12 gives it no capability: it asks the host to
 * resize a frame the extension already owns.
 */

import { getChannel, getSlotProps } from "./connect";

export type DialogOptions = {
	title?: string;
	/** In pixels. The host clamps it. */
	width?: number;
	/** Handed to the document the dialog slot mounts, at its connect handshake. */
	props?: Record<string, unknown>;
};

const call = (method: string, params?: unknown) => getChannel().call(method, params);

/** Resolves when the dialog closes: with the result, or with nothing if it was dismissed. */
export const openDialog = (options: DialogOptions = {}) => call("ui.openDialog", options);

/** Called by the dialog's own frame. The result travels back to whoever opened it. */
export const closeDialog = (result?: unknown) => call("ui.closeDialog", { result });

export const setHeight = (height: number) => call("ui.setHeight", { height });

/**
 * Keeps the dialog as tall as its content. Returns a function that stops it.
 *
 * `ResizeObserver` rather than a one-off measurement, because a dialog's content
 * usually arrives after the first paint — a list that loads, an image that
 * decodes.
 */
export const autoHeight = () => {
	const root = document.documentElement;
	const observer = new ResizeObserver(() => void setHeight(root.scrollHeight));
	observer.observe(root);
	return () => observer.disconnect();
};

export const ui = {
	openDialog,
	closeDialog,
	setHeight,
	autoHeight,
	/** What `openDialog` was called with. Read by the document the dialog mounted. */
	props: () => getSlotProps(),
};
