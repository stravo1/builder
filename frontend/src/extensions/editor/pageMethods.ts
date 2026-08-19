/**
 * The whole tree an extension can act on.
 *
 * The snapshot deliberately leaves the tree out (1.11): it is large and it
 * changes on every keystroke, so an extension asks for it rather than being sent
 * it. `block.get` serves the extension that needs one node.
 *
 * The tree comes from the canvas, not from `pageStore.pageBlocks`, for two
 * reasons. Undo replaces the root instance, so `pageBlocks` goes stale after the
 * first undo. And `block.get` and `block.update` both resolve against the
 * canvas, so reading a different tree would hand back ids the other two methods
 * could not resolve.
 *
 * While the user edits a component, the canvas holds that fragment rather than
 * the page, and this answers with the fragment. The alternative returns ids an
 * extension cannot act on. `context.editingMode` says which it is looking at.
 */

import useCanvasStore from "@/stores/canvasStore";
import { getBlockObject } from "@/utils/helpers";
import type { MethodTable } from "../host/capabilities";
import { refuse } from "../params";

/**
 * A list, because that is the shape Builder stores a page in, even though the
 * list always holds one root today.
 *
 * No canvas is a refusal rather than an empty list, so an extension that called
 * before the editor was ready can tell that apart from a page with nothing on
 * it.
 */
const getBlocks = () => {
	const root = useCanvasStore().activeCanvas?.getRootBlock();
	if (!root) throw refuse(`No canvas is open.`, "no_canvas");
	return [getBlockObject(root)];
};

export const pageMethods: MethodTable = {
	"page.getBlocks": { needs: "page.read", run: getBlocks },
};
