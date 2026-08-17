/**
 * The vocabulary the host and the SDK both read.
 *
 * Domain types first, then the shapes that cross a port. `transport/envelope.ts`
 * holds the guards over these shapes.
 */

/** The four documents an extension can have. The host names one at the handshake. */
export type ExtensionSlot = "main" | "panel" | "dialog" | "settings";

/** Every capability the bridge gates a method by. Mirrors CAPABILITIES in builder_extension.py. */
export type Capability =
	| "context.read"
	| "block.read"
	| "block.update"
	| "page.read"
	| "token.write"
	| "ui.dialog";

/** A "ui" extension may paint. A "headless" one registers descriptors and nothing else. */
export type ExtensionRuntime = "ui" | "headless";

/** One enabled record, as get_enabled_extensions returns it. */
export type InstalledExtension = {
	name: string; // extension_name, "acme/icons"
	label: string;
	runtime: ExtensionRuntime;
	entry: string; // script_url, the file the SDK imports
	capabilities: Capability[];
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
export type AnyVersionMessage = (Omit<RequestMessage, "v"> | Omit<ResponseMessage, "v"> | Omit<EventMessage, "v">) & {
	v: number;
};
