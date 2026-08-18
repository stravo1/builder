/**
 * The one owner of an extension's live state: its entry channel, its message
 * budget, and the unregister list teardown walks.
 *
 * A factory rather than a module: `index.ts` holds the one instance the editor
 * runs on, and a test builds its own with its own method table.
 */

import { ChannelCallError, unknownMethod, type Dispatcher, type PortChannel } from "../transport/createPortChannel";
import type { InstalledExtension } from "../types";
import { assertGranted, type MethodTable } from "./capabilities";
import { createBudget, type Budget } from "./rateLimit";

const overBudget = (extension: string) =>
	new ChannelCallError({ message: `"${extension}" is sending too many messages.`, code: "rate_limited" });

export const createExtensionBridge = (methods: MethodTable = {}) => {
	// a Map, not the object itself: a frame names the method, and "constructor"
	// would answer from the prototype with something that is not a HostMethod
	const table = new Map(Object.entries(methods));
	const entryChannels = new Map<string, PortChannel>();
	const budgets = new Map<string, Budget>();
	const unregisters = new Map<string, Array<() => void>>();

	// keyed by extension, not by frame: all four frames of one extension share one budget
	const budgetFor = (extension: string) => {
		const known = budgets.get(extension);
		if (known) return known;

		const budget = createBudget(extension);
		budgets.set(extension, budget);
		return budget;
	};

	/**
	 * The first frame of an extension to connect is always its entry frame, because
	 * no UI frame can exist before `main.js` has registered anything (B2).
	 */
	const connect = (extension: string, channel: PortChannel) => {
		if (!entryChannels.has(extension)) entryChannels.set(extension, channel);
	};

	/** Identity, not name: a reconnecting frame must not delete its own replacement. */
	const disconnect = (extension: string, channel: PortChannel) => {
		if (entryChannels.get(extension) === channel) entryChannels.delete(extension);
	};

	const getEntryChannel = (extension: string) => entryChannels.get(extension);

	/**
	 * One dispatcher per frame, closed over the record it was handed, so a frame
	 * never names the extension it speaks for and cannot borrow another's grants.
	 *
	 * Not memoized: a refetched record carries fresh grants, and a cached
	 * dispatcher would keep answering with the old ones.
	 */
	const dispatcherFor =
		(extension: InstalledExtension): Dispatcher =>
		(method, params) => {
			// cheapest check first, and a flood of unknown methods is still a flood
			if (!budgetFor(extension.name).take()) throw overBudget(extension.name);

			const entry = table.get(method);
			if (!entry) throw unknownMethod(method);

			assertGranted(extension, method, entry.needs);
			return entry.run(params, extension);
		};

	/**
	 * Fills the table after construction, so a surface can import the bridge for
	 * `dispatcherFor` without the bridge importing the surface back. Once only:
	 * a second call would give the method list two owners.
	 */
	const define = (added: MethodTable) => {
		if (table.size) throw new Error("The extension method table is already defined");
		Object.entries(added).forEach(([method, entry]) => table.set(method, entry));
	};

	/** Milestone 4 appends every `register` the bridge makes on an extension's behalf (B2). */
	const onTeardown = (extension: string, unregister: () => void) => {
		const list = unregisters.get(extension) ?? [];
		unregisters.set(extension, list);
		list.push(unregister);
	};

	/**
	 * The bridge does not wait for a disabled or uninstalled extension to clean up
	 * after itself, because its frames may never run again (B2).
	 */
	const teardown = (extension: string) => {
		unregisters.get(extension)?.forEach((unregister) => unregister());
		unregisters.delete(extension);
		entryChannels.get(extension)?.close();
		entryChannels.delete(extension);
		budgets.delete(extension);
	};

	return { connect, disconnect, getEntryChannel, define, dispatcherFor, onTeardown, teardown };
};

export type ExtensionBridge = ReturnType<typeof createExtensionBridge>;
