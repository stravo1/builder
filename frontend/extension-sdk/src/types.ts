/**
 * The vocabulary the host and the SDK both read.
 *
 * Domain types first, then the shapes that cross a port. `transport/messages.ts`
 * holds the guards over these shapes.
 */

/** The five documents an extension can have. The host names one at the handshake. */
export type ExtensionSlot = "main" | "panel" | "dialog" | "popover" | "settings";

/** Every capability the bridge gates a method by. Mirrors CAPABILITIES in builder_extension.py. */
export const CAPABILITIES = [
	"context.read",
	"block.read",
	"block.update",
	"block.insert",
	"page.read",
	"token.write",
	"ui.dialog",
	"ui.popover",
	"data.access",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** One enabled record, as get_enabled_extensions returns it. */
export type InstalledExtension = {
	name: string; // extension_name, "acme/icons"
	label: string;
	entry: string; // script_url, the file the SDK imports
	capabilities: Capability[];
};

export type Breakpoint = "desktop" | "tablet" | "mobile";

/**
 * What the host publishes about the selection (1.11).
 *
 * Every field but `count` describes one block, so every field but `count` is
 * defined only when exactly one block names it. With three blocks selected,
 * `isText: true` would not be a coarse answer, it would be a false one.
 *
 * A rule naming any of these therefore stops matching under a multi-selection,
 * because the matcher compares strictly and nothing equals `undefined`. The item
 * hides rather than acting on a claim about a block the user did not mean.
 *
 * The context menu looks like an exception and is not one: a right-click names
 * one block, so the host fills these from that block, whatever else is selected.
 *
 * The kind checks stay separate booleans rather than one `blockType`, because
 * `Block` treats them as independent. A block can be a link and a container.
 */
export type EditorSelection = {
	count: number;
	/** Every selected block, in the order the canvas holds them. Always present. */
	blockIds: string[];
	blockId?: string;
	element?: string; // the tag, the underlying truth behind every kind check
	isRoot?: boolean;
	isText?: boolean;
	isImage?: boolean;
	isHTML?: boolean;
	isSVG?: boolean;
	isLink?: boolean;
	isContainer?: boolean;
	isVideo?: boolean;
	isInput?: boolean;
	isRepeater?: boolean;
	isComponent?: boolean; // isExtendedFromComponent
	isChildOfComponent?: boolean;
};

/** One block's own answers, carrying no claim about the selection it sits in. */
export type BlockFacts = Omit<EditorSelection, "count" | "blockIds">;

/**
 * The snapshot an extension reads instead of Builder's live state (1.11).
 *
 * A field enters this list only when a built-in `condition` already reads it.
 * Adding a field later is cheap. Removing one is not.
 */
export type EditorContext = {
	selection: EditorSelection;
	breakpoint: Breakpoint;
	editingMode: "page" | "fragment";
	readOnly: boolean;
	isAIEnabled: boolean;
	/** Null while no page is open, so nothing can read an empty route as a real one. */
	page: { route: string; isTemplate: boolean; isStandard: boolean; published: boolean } | null;
	site: { isDeveloperMode: boolean; isFCSite: boolean };
};

/**
 * Extensions ship on their own schedule and will run against an older Builder,
 * so every message names the version it was written for.
 */
export const PROTOCOL_VERSION = 1;

/**
 * The one message sent on the window, with the port transferred beside it.
 * Everything after this runs on the port.
 *
 * It names no extension and no capability. The host knows which extension a port
 * belongs to, and the host alone enforces a capability.
 */
export type ConnectMessage = {
	v: typeof PROTOCOL_VERSION;
	type: "connect";
	slot: ExtensionSlot;
	entry: string;
	theme: "light" | "dark";
	props?: Record<string, unknown>; // only ever set for a dialog
};

export type ChannelError = {
	message: string;
	/** Set when a caller branches on the reason, such as "unsupported_version". */
	code?: string;
};

export type RequestMessage = {
	v: typeof PROTOCOL_VERSION;
	type: "request";
	id: number;
	method: string;
	params?: unknown;
};

export type ResponseMessage = {
	v: typeof PROTOCOL_VERSION;
	type: "response";
	id: number;
	result?: unknown;
	error?: ChannelError;
};

export type EventMessage = {
	v: typeof PROTOCOL_VERSION;
	type: "event";
	event: string;
	payload?: unknown;
};

/** Both sides send all three kinds, so no shape carries a direction. */
export type PortMessage = RequestMessage | ResponseMessage | EventMessage;

/**
 * A message this Builder recognizes the shape of, at a version it may not speak.
 * The channel answers such a message instead of dropping it, so an extension
 * built against a newer Builder learns why its call failed.
 */
export type AnyVersionMessage = (
	| Omit<RequestMessage, "v">
	| Omit<ResponseMessage, "v">
	| Omit<EventMessage, "v">
) & {
	v: number;
};
