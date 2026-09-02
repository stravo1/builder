/**
 * Storage an extension owns outright (1.12).
 *
 * No capability gates any of this, because none of it touches Builder's state.
 * That also means `state.set` is not a write capability, so the read-only
 * refusal does not reach it: a read-only page is about the page, and this is the
 * extension's own drawer.
 *
 * An installation keeps its store on the site, one row per key. It used to live
 * in `localStorage` under the extension's name, and `localStorage` is per
 * browser, so two people sharing a machine shared every extension's state. On the
 * site it belongs to one user and follows them between machines.
 *
 * A development extension still uses the browser. Its installation is deleted on
 * every `pagehide`, so a row on the site would not survive the reload an author
 * needs to test that their own state persists.
 */

import { isDevExtension } from "@/extensions/devExtension";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { createResource } from "frappe-ui";
import type { MethodTable } from "../host/capabilities";
import { fields, refuse, text } from "../params";

type Store = Record<string, unknown>;

/** Rebuilt plain, because `createResource` answers with its reactive `data`. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const invoke = (method: string, params: Record<string, unknown>) =>
	createResource({ url: `builder.extensions.state.${method}` })
		.submit(params)
		.then(plain)
		.catch((thrown: unknown) => {
			const sent = thrown as { messages?: string[]; message?: string };
			throw refuse(sent.messages?.[0] || sent.message || "The server refused that call.", "server_error");
		});

/**
 * Generous for settings and a cached list, small enough that no extension can
 * fill the origin the editor shares with it. The server holds the same ceiling
 * for an installation.
 */
const MAX_BYTES = 100_000;

/** Namespaced, the way `pageStore.ts:63` namespaces a page's route variables. */
const keyFor = (extension: InstalledExtension) => `builder-extension:${extension.name}`;

/**
 * A store that will not parse is treated as absent.
 *
 * This is the one place a broad fallback is right: the value is the extension's
 * own, nothing else reads it, and the alternative is an extension that can never
 * write again because of one bad entry it cannot see or clear.
 */
const readLocal = (extension: InstalledExtension): Store => {
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

const writeLocal = (extension: InstalledExtension, store: Store) => {
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

const get = (_params: unknown, extension: InstalledExtension) =>
	isDevExtension(extension) ? readLocal(extension) : invoke("get_state", { extension: extension.name });

/**
 * A patch, merged at the top level. `set` never removes what a call leaves
 * unmentioned, which is the rule `tokens.set` follows too (D6).
 *
 * An extension has up to five frames and any of them may write. Merging is what
 * stops a panel saving its query from erasing what the entry frame stored. The
 * server keeps one row per key, so two frames writing different keys never race.
 */
const set = (params: unknown, extension: InstalledExtension) => {
	const patch = fields(params).state;
	if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
		throw refuse(`"state" must be an object.`, "invalid_params");
	}

	if (!isDevExtension(extension)) {
		return invoke("set_state", { extension: extension.name, state: patch });
	}
	writeLocal(extension, { ...readLocal(extension), ...(patch as Store) });
};

const unset = (params: unknown, extension: InstalledExtension) => {
	const key = text(fields(params).key, "key");

	if (!isDevExtension(extension)) {
		return invoke("unset_state", { extension: extension.name, key });
	}
	const store = readLocal(extension);
	delete store[key];
	writeLocal(extension, store);
};

export const stateMethods: MethodTable = {
	// the extension's own drawer, so nothing here needs a grant (1.12)
	"state.get": { needs: null, run: get },
	"state.set": { needs: null, run: set },
	"state.unset": { needs: null, run: unset },
};
