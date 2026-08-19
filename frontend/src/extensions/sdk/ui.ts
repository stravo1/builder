/**
 * The dialog, from inside a frame (1.15).
 *
 * Two frames are involved and neither knows about the other. One frame asks for
 * a dialog and waits. The host opens the dialog slot's document in a new frame,
 * and that frame calls `closeDialog` when it is done. The host resolves the
 * first frame's pending call with whatever the second one passed.
 *
 * The host controls the dialog's dimensions, so an extension only supplies its
 * title, content props, and eventual result.
 */

import { getChannel, getSlotProps } from "./connect";

export type DialogOptions = {
	title?: string;
	/** Handed to the document the dialog slot mounts, at its connect handshake. */
	props?: Record<string, unknown>;
};

const call = (method: string, params?: unknown) => getChannel().call(method, params);

/** Resolves when the dialog closes: with the result, or with nothing if it was dismissed. */
export const openDialog = (options: DialogOptions = {}) => call("ui.openDialog", options);

/** Called by the dialog's own frame. The result travels back to whoever opened it. */
export const closeDialog = (result?: unknown) => call("ui.closeDialog", { result });

export const ui = {
	openDialog,
	closeDialog,
	/** What `openDialog` was called with. Read by the document the dialog mounted. */
	props: () => getSlotProps(),
};
