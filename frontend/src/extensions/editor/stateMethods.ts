/**
 * Storage an extension owns outright (1.12).
 *
 * No capability gates any of this, because none of it touches Builder's state.
 * That also means `state.set` is not a write capability, so the read-only
 * refusal does not reach it: a read-only page is about the page, and this is the
 * extension's own drawer.
 *
 * The host holds the store because a sandboxed frame at an opaque origin has no
 * `localStorage` of its own. So the frame asks, and the host reads and writes on
 * its behalf, under a key it composes from the extension's name.
 *
 * Per browser and per user, like every other key Builder keeps here. An
 * extension that needs a value to follow a user between machines wants a record,
 * not this.
 */

import type { MethodTable } from "../host/capabilities";
import { fields, refuse, text } from "../params";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

/** Namespaced, the way `pageStore.ts:63` namespaces a page's route variables. */
const keyFor = (extension: InstalledExtension) => `builder-extension:${extension.name}`;

/**
 * Generous for settings and a cached list, small enough that no extension can
 * fill the origin the editor shares with it.
 */
const MAX_BYTES = 100_000;

type Store = Record<string, unknown>;

/**
 * A store that will not parse is treated as absent.
 *
 * This is the one place a broad fallback is right: the value is the extension's
 * own, nothing else reads it, and the alternative is an extension that can never
 * write again because of one bad entry it cannot see or clear.
 */
const read = (extension: InstalledExtension): Store => {
	const stored = localStorage.getItem(keyFor(extension));
	if (!stored) return {};

	try {
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		console.warn(`Extension "${extension.name}" had unreadable state, which was dropped.`);
		return {};
	}
};

const write = (extension: InstalledExtension, store: Store) => {
	const serialized = JSON.stringify(store);
	if (serialized.length > MAX_BYTES) {
		throw refuse(`"${extension.name}" state is larger than ${MAX_BYTES / 1000} kB.`, "state_too_large");
	}

	try {
		localStorage.setItem(keyFor(extension), serialized);
	} catch {
		// the origin is shared with Builder's own keys, so this can happen to an
		// extension that stayed well inside its own limit
		throw refuse(`This browser has no room left to store "${extension.name}" state.`, "storage_full");
	}
};

const get = (_params: unknown, extension: InstalledExtension) => read(extension);

/**
 * A patch, merged at the top level. `set` never removes what a call leaves
 * unmentioned, which is the rule `tokens.set` follows too (D6).
 *
 * An extension has up to five frames and any of them may write. Merging is what
 * stops a panel saving its query from erasing what the entry frame stored.
 */
const set = (params: unknown, extension: InstalledExtension) => {
	const patch = fields(params).state;
	if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
		throw refuse(`"state" must be an object.`, "invalid_params");
	}

	write(extension, { ...read(extension), ...(patch as Store) });
};

const unset = (params: unknown, extension: InstalledExtension) => {
	const key = text(fields(params).key, "key");
	const store = read(extension);
	delete store[key];
	write(extension, store);
};

export const stateMethods: MethodTable = {
	// the extension's own drawer, so nothing here needs a grant (1.12)
	"state.get": { needs: null, run: get },
	"state.set": { needs: null, run: set },
	"state.unset": { needs: null, run: unset },
};
