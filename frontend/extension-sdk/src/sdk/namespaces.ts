/**
 * `builder.<surface>.<verb>` over one call.
 *
 * Registrations are declarations, written at module scope. Every frame of an
 * extension imports the same module, so every frame reads them — which is what
 * lets a panel tab declare the document it loads in the same breath as the tab
 * itself, even though the two are used in different frames.
 *
 * Only the entry frame tells the host. A declaration read in a panel frame
 * records what that frame needs locally and sends nothing, so the host hears
 * each registration once however many frames are open.
 *
 * Nothing is validated here. The host validates every parameter (1.12), and a
 * copy of a rule on this side would be a second thing to keep in step.
 */

import { holdAction, releaseAction, type ActionHandler } from "./actions";
import { getChannel } from "./connect";
import { getActiveSlot, registerSlot } from "./slots";

/** An imperative call. Any frame may make one: `update` and `run` are not declarations. */
const call = (method: string, params?: unknown) => getChannel().call(method, params);

/**
 * A declaration. The host hears it from the entry frame only.
 *
 * A refusal is logged as well as returned, because a declaration at module scope
 * is usually not awaited, and a silently rejected registration is a surface that
 * never appears with nothing to explain it.
 *
 * A method this Builder does not have is a version gap, not a mistake. An
 * extension ships on its own schedule, so it loses that one surface and keeps
 * the rest, and the warning says which Builder is behind rather than blaming
 * the extension.
 */
const declare = (method: string, params?: unknown) => {
	if (getActiveSlot() !== "main") return Promise.resolve();

	const sent = call(method, params);
	sent.catch((error) => {
		if ((error as { code?: string }).code === "unknown_method") {
			console.warn(`[builder] this Builder has no "${method}", so that surface is skipped`);
			return;
		}
		console.error(`[builder] "${method}" was refused`, error);
	});
	return sent;
};

export type ShowWhen = Record<string, unknown>;

/** Resolves to the module holding a slot's document. */
export type SlotLoader = () => Promise<unknown>;

export type LeftPanelRegistration = {
	name: string;
	label: string;
	icon: string;
	/** What the tab's frame paints. Declared here because the tab is what shows it. */
	load?: SlotLoader;
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
};

export type ToolbarRegistration = {
	name: string;
	region: "left" | "center" | "right";
	icon: string;
	label?: string;
	tooltip?: string;
	/** The name of an action this extension registered. */
	action?: string;
	badge?: string | number | null;
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
	enableWhen?: ShowWhen;
};

export type ContextMenuRegistration = {
	name: string;
	label: string;
	/** The name of an action this extension registered. A row with none does nothing. */
	action: string;
	/** Which menu the row belongs to. Fixed at registration. Defaults to "both". */
	menu?: "canvas" | "layers" | "both";
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
	enableWhen?: ShowWhen;
};

export type SettingsRegistration = {
	name: string;
	label: string;
	title: string;
	icon: string;
	/** What the settings frame paints. Declared here, because this item shows it. */
	load?: SlotLoader;
	before?: string;
	after?: string;
};

/** Which Builder control the host renders. A section holds values, not triggers. */
export type ControlName = "text" | "number" | "select" | "toggle" | "color" | "range";

/** One control in a property section (Tier B). The host renders it (B3, B4). */
export type Control = {
	name: string;
	control: ControlName;
	label?: string;
	placeholder?: string;
	/** The host writes the block itself. Needs the `block.update` capability. */
	bind?: { attribute?: string; style?: string };
	/** The extension's own value, when no block property holds it (B4). */
	value?: unknown;
	/** An action to invoke after a bound write, or on every change when unbound. */
	action?: string;
	/** For "select" and "toggle". A toggle option may carry an icon. */
	options?: Array<{ label: string; value: string; icon?: string }>;
	min?: number;
	max?: number;
	step?: number;
	/** Per control, so one control can hide while the rest of the section stays. */
	showWhen?: ShowWhen;
};

export type PropertiesRegistration = {
	name: string;
	/** The section header. Defaults to `name`. */
	label?: string;
	controls: Control[];
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
};

export type ItemPatch = {
	visible?: boolean;
	enabled?: boolean;
	label?: string;
	icon?: string;
	tooltip?: string;
	badge?: string | number | null;
};

export const leftPanel = {
	register: ({ load, ...registration }: LeftPanelRegistration) => {
		// recorded in every frame, used in the panel frame, sent by neither
		if (load) registerSlot("panel", { load });
		return declare("leftPanel.register", registration);
	},
	unregister: (name: string) => call("leftPanel.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("leftPanel.update", { name, patch }),
};

export const toolbar = {
	register: (registration: ToolbarRegistration) => declare("toolbar.register", registration),
	unregister: (name: string) => call("toolbar.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("toolbar.update", { name, patch }),
};

export const contextMenu = {
	register: (registration: ContextMenuRegistration) => declare("contextMenu.register", registration),
	unregister: (name: string) => call("contextMenu.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("contextMenu.update", { name, patch }),
};

export const properties = {
	registerSection: (registration: PropertiesRegistration) =>
		declare("properties.registerSection", registration),
	unregisterSection: (name: string) => call("properties.unregisterSection", { name }),
	/** Replaces the whole list, for a control list that depends on the extension's own state. */
	setControls: (name: string, controls: Control[]) => call("properties.setControls", { name, controls }),
	update: (name: string, patch: ItemPatch) => call("properties.update", { name, patch }),
};

export const settings = {
	registerItem: ({ load, ...registration }: SettingsRegistration) => {
		if (load) registerSlot("settings", { load });
		return declare("settings.registerItem", registration);
	},
	unregisterItem: (name: string) => call("settings.unregisterItem", { name }),
	update: (name: string, patch: ItemPatch) => call("settings.update", { name, patch }),
};

export type ContextField =
	| "selection"
	| "breakpoint"
	| "editingMode"
	| "readOnly"
	| "isAIEnabled"
	| "page"
	| "site";

export type ContextHandler = (context: Record<string, unknown>) => void;

export const context = {
	/** The whole snapshot, once. For startup. */
	get: () => call("context.get") as Promise<Record<string, unknown>>,

	/**
	 * Names the fields this extension cares about, so the host sends nothing else
	 * and only when one of them changes.
	 *
	 * Use it for a fact no rule can state — `isSVG` is in the snapshot but is not
	 * a rule key — and push the answer back with `update`. Use `showWhen` for
	 * anything the rule vocabulary already covers: it costs no messages.
	 */
	subscribe: (fields: ContextField[], handler: ContextHandler) => {
		// the host holds one subscription per extension, so a push carries every
		// field any call site named. This handler hears only its own.
		let seen = "";
		const stop = getChannel().listen("context", (payload) => {
			const context = payload as Record<string, unknown>;
			const mine = JSON.stringify(fields.map((field) => context[field]));
			if (mine === seen) return;
			seen = mine;
			handler(context);
		});
		// a call, not a declaration: any frame may subscribe, and the host pushes
		// to every frame of the extension, so a panel hears what a panel asked for
		void call("context.subscribe", { fields });
		return stop;
	},
};

export type BlockPatch = {
	attributes?: Record<string, string | null>;
	/** Lands on the breakpoint the user is looking at unless `breakpoint` names one. */
	styles?: Record<string, string | number | null>;
	classes?: string[];
	innerHTML?: string;
	breakpoint?: "desktop" | "tablet" | "mobile";
};

export const block = {
	/** One block and its subtree, as a plain object. The id comes from the context or a menu row. */
	get: (blockId: string) => call("block.get", { blockId }) as Promise<Record<string, unknown>>,
	/** Refused without `block.update`, and refused again while the page is read-only. */
	update: (blockId: string, patch: BlockPatch) => call("block.update", { blockId, ...patch }),
	/**
	 * A new block inside `parentId`, appended unless `index` names a place.
	 *
	 * Answers with the new `blockId`, so a tree is built by inserting into what
	 * came back. The new block is not selected: the selection stays the user's.
	 */
	insert: (parentId: string, block: NewBlock, index?: number) =>
		call("block.insert", { parentId, block, index }) as Promise<{ blockId: string }>,
};

/** What `block.insert` draws. `element` is required, and everything else is optional. */
export type NewBlock = {
	element: string;
	attributes?: Record<string, string | null>;
	styles?: Record<string, string | number | null>;
	classes?: string[];
	innerHTML?: string;
};

export const page = {
	/**
	 * The tree the canvas holds, as a list of roots. A node carries its own
	 * `children`, so walk it to reach every block.
	 *
	 * While the user edits a component this answers with that component, because
	 * those are the ids `block.get` and `block.update` can resolve. Read
	 * `context.editingMode` to tell the two apart.
	 */
	getBlocks: () => call("page.getBlocks") as Promise<Array<Record<string, unknown>>>,
};

export const state = {
	/** Everything this extension has stored. Per browser and per user. */
	get: () => call("state.get") as Promise<Record<string, unknown>>,
	/** Merged at the top level. Never removes a key the patch leaves unmentioned. */
	set: (state: Record<string, unknown>) => call("state.set", { state }),
	unset: (key: string) => call("state.unset", { key }),
};

/** One row in `Builder Token`, as an extension describes it (D6). */
export type ExtensionToken = {
	/** This extension's own stable id for the token. The record's name is a uuid. */
	key: string;
	token_name: string;
	type: "Color" | "Dimension" | "Font";
	value: string;
	dark_value?: string;
	group?: string;
};

export const tokens = {
	/**
	 * Upserts by `key`, and never deletes what the call leaves unmentioned.
	 *
	 * A network call, not a client write: the row has to exist server-side to
	 * reach the published site, so this resolves only once Frappe answers.
	 */
	set: (tokens: ExtensionToken[]) => call("tokens.set", { tokens }),
	unset: (key: string) => call("tokens.unset", { key }),
};

/** What one extension may do to one doctype, as the host answers it. */
export type Grant = {
	doctype: string;
	read: boolean;
	write: boolean;
	delete: boolean;
	/** The user said no last time, so `requestAccess` returns without a dialog. */
	denied: boolean;
};

export type Access = "read" | "write" | "delete";

export const data = {
	/**
	 * Asks the user for access to one doctype, in a Builder dialog.
	 *
	 * The one method here that can open a dialog. Call it when the user is
	 * expecting it — behind a button they pressed — because it is modal.
	 *
	 * It returns without asking when the grant already covers everything named,
	 * and when the user said no last time. Read `denied` on the answer to tell
	 * "not yet asked" from "already refused".
	 */
	requestAccess: (doctype: string, access: Access[]) =>
		call("data.requestAccess", { doctype, access }) as Promise<Grant>,

	/** What this extension may already do, without asking for anything. */
	getAccess: (doctype: string) => call("data.getAccess", { doctype }) as Promise<Grant>,
};

export const actions = {
	/**
	 * The handler stays in this frame, and the host learns only the name.
	 *
	 * Only the entry frame holds and names it, so the host always calls the frame
	 * that outlives the others.
	 */
	register: (name: string, handler: ActionHandler) => {
		if (getActiveSlot() !== "main") return Promise.resolve();
		holdAction(name, handler);
		return declare("actions.register", { name });
	},
	unregister: (name: string) => {
		if (getActiveSlot() !== "main") return Promise.resolve();
		releaseAction(name);
		return call("actions.unregister", { name });
	},
	/** Runs an action this extension owns, from any of its frames. */
	run: (name: string, context?: Record<string, unknown>) => call("actions.run", { name, context }),
};
