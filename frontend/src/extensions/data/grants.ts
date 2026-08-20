/**
 * Which doctypes an extension may touch, and how it asks.
 *
 * The capability `data.access` says an extension works with site data at all,
 * and an admin answers that at install. A grant says which doctype, and the
 * **user** answers that here, while the editor runs. Frappe's own permission
 * decides whether this user may do it, and no call in this tree widens it.
 *
 * A grant is asked for, never assumed. `data.requestAccess` is the one method
 * that opens a dialog. Every other data method refuses without a grant, so no
 * modal lands while the user drags a block, and a loop of calls cannot stack a
 * pile of dialogs. `data.getAccess` lets an extension check first and draw its
 * own "connect to Contacts" button.
 *
 * Nothing is cached. The record is the only owner of the answer (rule 22), and a
 * stale copy here would cost the user a second dialog for a grant they already
 * gave.
 */

import { createResource } from "frappe-ui";
import { ref } from "vue";
import { bridge } from "../host/bridge";
import type { MethodTable } from "../host/capabilities";
import { fields, refuse, text } from "../params";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

export const ACCESS = ["read", "write", "delete"] as const;
export type Access = (typeof ACCESS)[number];

/** What the server says about one extension and one doctype. */
export type Grant = {
	doctype: string;
	read: boolean;
	write: boolean;
	delete: boolean;
	/** The last answer was no. The extension is not asked again until this clears. */
	denied: boolean;
};

/**
 * Doctypes the prompt warns about twice.
 *
 * None of these is blocked. A user who means it can still allow one, and every
 * write is still bounded by that user's own permission. The list exists because
 * "allow Acme to write Contact" and "allow Acme to write User" should not read
 * the same way.
 *
 * `Builder Extension` is the sharpest case: write access to it lets an extension
 * rewrite its own capability list, so the install-time gate becomes advisory.
 */
export const SENSITIVE_DOCTYPES = new Set([
	"Builder Extension",
	"Builder Extension Grant",
	"Builder Token",
	"User",
	"Role",
	"Role Profile",
	"User Permission",
	"DocShare",
	"DocType",
	"Custom Field",
	"Property Setter",
	"Server Script",
	"Client Script",
	"Builder Client Script",
	"Webhook",
	"System Settings",
	"Website Settings",
	"Builder Settings",
	"Social Login Key",
	"Email Account",
]);

/** One-shot, the way `tokenMethods.ts:27` calls a whitelisted method. */
const invoke = (url: string, params: Record<string, unknown>) => createResource({ url }).submit(params);

export type GrantPrompt = {
	extension: InstalledExtension;
	doctype: string;
	/** What is still missing. An access the user already gave is not asked for again. */
	access: Access[];
	sensitive: boolean;
};

/** Read by `ExtensionGrantDialog.vue`. One prompt stands at a time, so this is a single ref. */
export const pendingPrompt = ref<GrantPrompt | null>(null);

let answer: ((granted: boolean) => void) | null = null;

/**
 * The user's answer, from the dialog. Dismissing it counts as no, which is what
 * every browser permission prompt does and the only honest reading of a
 * question nobody answered.
 */
export const answerPrompt = (granted: boolean) => {
	const settle = answer;
	answer = null;
	pendingPrompt.value = null;
	settle?.(granted);
};

/** Which extensions already have a teardown hook, so asking twice adds one hook. */
const hooked = new Set<string>();

const hookTeardown = (extension: InstalledExtension) => {
	if (hooked.has(extension.name)) return;
	hooked.add(extension.name);
	bridge.onTeardown(extension.name, () => {
		hooked.delete(extension.name);
		// a prompt outliving the extension that asked would ask on behalf of nobody
		if (pendingPrompt.value?.extension.name === extension.name) answerPrompt(false);
	});
};

/**
 * One dialog at a time, in the order the requests arrived.
 *
 * Two frames of one extension can ask at once, and so can two extensions. A
 * queue is what stops the second request drawing over the first, and it costs a
 * wait rather than a refusal.
 */
let queue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
	const next = queue.then(task, task);
	queue = next.catch(() => undefined);
	return next;
};

const readDoctype = (params: unknown) => text(fields(params).doctype, "doctype");

const readAccess = (value: unknown): Access[] => {
	if (!Array.isArray(value) || !value.length) {
		// escaped rather than single-quoted, the way tokenMethods.ts:58 writes the
		// same refusal: eslint wants double quotes and prettier wants fewer escapes
		throw refuse("\"access\" must be a non-empty list.", "invalid_params");
	}
	const unknown = value.filter((entry) => !ACCESS.includes(entry as Access));
	if (unknown.length) {
		throw refuse(`"access" must hold only: ${ACCESS.join(", ")}.`, "invalid_params");
	}
	return value as Access[];
};

/**
 * A fresh plain object, never what the resource resolved with.
 *
 * `createResource` keeps its `data` reactive, so it answers with a Vue proxy,
 * and `postMessage` cannot clone a proxy — the same fault `uiMethods.ts` hit
 * with dialog props. Rebuilding the shape here fixes it and checks what the
 * server sent in the same step.
 */
const toGrant = (value: unknown, doctype: string): Grant => {
	const sent = fields(value);
	return {
		doctype,
		read: Boolean(sent.read),
		write: Boolean(sent.write),
		delete: Boolean(sent.delete),
		denied: Boolean(sent.denied),
	};
};

const readGrant = (extension: InstalledExtension, doctype: string) =>
	invoke("builder.extension_data.get_extension_grant", {
		extension: extension.name,
		doctype,
	}).then((sent: unknown) => toGrant(sent, doctype));

const ask = (request: GrantPrompt) =>
	new Promise<boolean>((resolve) => {
		answer = resolve;
		pendingPrompt.value = request;
	});

const prompt = async (extension: InstalledExtension, doctype: string, access: Access[]) => {
	hookTeardown(extension);
	const granted = await ask({
		extension,
		doctype,
		access,
		sensitive: SENSITIVE_DOCTYPES.has(doctype),
	});

	return invoke("builder.extension_data.record_extension_grant", {
		extension: extension.name,
		doctype,
		access: granted ? access : [],
		denied: !granted,
	}).then((sent: unknown) => toGrant(sent, doctype));
};

/**
 * Asks the user, unless the record already answers.
 *
 * Three ways this returns without a dialog: the grant already covers everything
 * asked for, the user said no last time, or another extension is mid-prompt and
 * this one waits its turn.
 */
const requestAccess = async (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	const doctype = readDoctype(sent);
	const access = readAccess(sent.access);

	const current = await readGrant(extension, doctype);
	const missing = access.filter((entry) => !current[entry]);
	if (!missing.length || current.denied) return current;

	return enqueue(() => prompt(extension, doctype, missing));
};

const getAccess = (params: unknown, extension: InstalledExtension) =>
	readGrant(extension, readDoctype(params));

export const grantMethods: MethodTable = {
	// not a page write, so the read-only refusal does not reach it: read-only is
	// about the page being edited, and a Contact is not that page
	"data.requestAccess": { needs: "data.access", run: requestAccess },
	"data.getAccess": { needs: "data.access", run: getAccess },
};
