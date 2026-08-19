/**
 * Reading and writing one block (1.12).
 *
 * The context menu already hands an extension a `blockId`, and the snapshot
 * already carries `blockIds` for a multi-selection. Until now neither could be
 * resolved into anything. This is where an id becomes a block.
 *
 * An id arrives as a string from another realm, so the host resolves it against
 * the real tree and refuses anything that tree does not hold. Nothing here
 * trusts the frame beyond the shape of what it sent.
 *
 * Undo needs no help. `useCanvasHistory.ts:49` watches the root block deeply, so
 * a write made here is recorded as an undo step exactly like a write made by
 * Builder's own controls.
 */

import type Block from "@/block";
import useCanvasStore from "@/stores/canvasStore";
import { getBlockObject } from "@/utils/helpers";
import type { MethodTable } from "../host/capabilities";
import { fields, oneOf, optionalText, refuse, text } from "../params";
import type { Breakpoint } from "../types";

const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;

const findBlock = (params: unknown): Block => {
	const blockId = text(fields(params).blockId, "blockId");
	const block = useCanvasStore().activeCanvas?.findBlock(blockId);
	if (!block) throw refuse(`This page holds no block named "${blockId}".`, "unknown_block");
	return block;
};

/**
 * The whole subtree, as a plain object.
 *
 * `getBlockObject` is the copy Builder already makes for its own clipboard and
 * history, so it strips the parent link and the component reference — the two
 * things that cannot cross a port — and it is the shape a block is stored in.
 * An extension therefore reads what it would write.
 */
const get = (params: unknown) => getBlockObject(findBlock(params));

/** A record of strings, which is what an attribute map and a style map both are. */
const readMap = (value: unknown, name: string) => {
	if (value === undefined) return undefined;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw refuse(`"${name}" must be an object.`, "invalid_params");
	}
	return value as Record<string, unknown>;
};

const readClasses = (value: unknown) => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw refuse(`"classes" must be a list of strings.`, "invalid_params");
	}
	return value as string[];
};

/** `undefined` removes an attribute, the same way `removeAttribute` does. */
const writeAttributes = (block: Block, attributes: Record<string, unknown>) =>
	Object.entries(attributes).forEach(([attribute, value]) =>
		block.setAttribute(attribute, value === null ? undefined : optionalText(value, attribute)),
	);

/** `null` and `""` delete a style, which is `setStyle`'s own rule. */
const writeStyles = (block: Block, styles: Record<string, unknown>, breakpoint?: Breakpoint) =>
	Object.entries(styles).forEach(([style, value]) => {
		if (value !== null && typeof value !== "string" && typeof value !== "number") {
			throw refuse(`"styles.${style}" must be a string, a number or null.`, "invalid_params");
		}
		block.setStyle(style, value, breakpoint);
	});

/**
 * Every key is optional, and a patch naming none of them is a mistake worth
 * saying out loud rather than a write that quietly does nothing.
 *
 * A style lands on the breakpoint the user is looking at unless the patch names
 * one, because an extension writes without a canvas in front of it.
 */
const update = (params: unknown) => {
	const sent = fields(params);
	const block = findBlock(params);

	const attributes = readMap(sent.attributes, "attributes");
	const styles = readMap(sent.styles, "styles");
	const classes = readClasses(sent.classes);
	const innerHTML = optionalText(sent.innerHTML, "innerHTML");
	const breakpoint = sent.breakpoint === undefined ? undefined : oneOf(sent.breakpoint, BREAKPOINTS, "breakpoint");

	if (!attributes && !styles && !classes && innerHTML === undefined) {
		throw refuse(`This patch changes nothing.`, "invalid_params");
	}

	if (attributes) writeAttributes(block, attributes);
	if (styles) writeStyles(block, styles, breakpoint);
	if (classes) block.classes = classes;
	if (innerHTML !== undefined) block.setInnerHTML(innerHTML);
};

export const blockMethods: MethodTable = {
	"block.get": { needs: "block.read", run: get },
	// read-only is refused in the bridge, once, for every write capability (1.12)
	"block.update": { needs: "block.update", run: update },
};
