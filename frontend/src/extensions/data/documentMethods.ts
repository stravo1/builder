/**
 * CRUD on real documents.
 *
 * Two gates. The `data.access` capability says the site let this extension work
 * with its records at all, and the server checks it again before it touches
 * anything. The second is the one that matters most, and nothing here can reach
 * it: `frappe.client` runs the query as the logged-in user, so an extension sees
 * the rows that user sees and no others.
 *
 * The option names follow `createListResource` — `fields`, `filters`, `orderBy`,
 * `start`, `pageLength` — because an extension author is a frontend author and
 * that is the vocabulary already in this repo. The host translates them to
 * Frappe's own names on the way out.
 *
 * Not a page write, so read-only mode does not refuse any of it. Read-only is
 * about the page being edited, and a Contact is not that page.
 */

import { createResource } from "frappe-ui";
import type { MethodTable } from "../host/capabilities";
import { fields, optionalText, refuse, text, wholeNumber } from "../params";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

/**
 * Structured-cloneable, always.
 *
 * `createResource` keeps its `data` reactive, and `postMessage` cannot clone a
 * Vue proxy. A document has no fixed shape to rebuild field by field, so the
 * round trip through JSON is what makes it plain. It drops `undefined`, which a document off the wire never holds.
 */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

/** A server refusal, with the site's own message. */
const asRefusal = (thrown: unknown) => {
	const sent = thrown as { messages?: string[]; message?: string };
	return refuse(sent.messages?.[0] || sent.message || "The server refused that call.", "server_error");
};

/** One-shot, the way `tokenMethods.ts:27` calls a whitelisted method. */
export const invoke = (url: string, params: Record<string, unknown>) =>
	createResource({ url })
		.submit(params)
		.then(plain)
		.catch((thrown: unknown) => {
			throw asRefusal(thrown);
		});

const readDoctype = (sent: Record<string, unknown>) => text(sent.doctype, "doctype");

const readName = (sent: Record<string, unknown>) => text(sent.name, "name");

/** A patch or a new document. Never a list, and never a bare value. */
const readDoc = (value: unknown) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw refuse('"doc" must be an object.', "invalid_params");
	}
	return value as Record<string, unknown>;
};

/**
 * A dict of equalities, or Frappe's list form for anything else. Passed through
 * rather than parsed: the query builder is what understands a filter, and a
 * second reader here would be a second thing to keep in step.
 */
const readFilters = (value: unknown) => {
	if (value === undefined) return undefined;
	if (typeof value !== "object" || value === null) {
		throw refuse("A filter must be an object or a list.", "invalid_params");
	}
	return value;
};

const readFields = (value: unknown) => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw refuse('"fields" must be a list of field names.', "invalid_params");
	}
	return value as string[];
};

const optionalCount = (value: unknown, field: string) =>
	value === undefined ? undefined : wholeNumber(value, field);

export const getList = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.get_list", {
		extension: extension.name,
		doctype: readDoctype(sent),
		fields: readFields(sent.fields),
		filters: readFilters(sent.filters),
		or_filters: readFilters(sent.orFilters),
		order_by: optionalText(sent.orderBy, "orderBy"),
		group_by: optionalText(sent.groupBy, "groupBy"),
		limit_start: optionalCount(sent.start, "start"),
		// left out rather than defaulted here: the page size is the server's rule
		limit_page_length: optionalCount(sent.pageLength, "pageLength"),
	});
};

export const getCount = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.get_count", {
		extension: extension.name,
		doctype: readDoctype(sent),
		filters: readFilters(sent.filters),
	});
};

export const getDoc = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.get_doc", {
		extension: extension.name,
		doctype: readDoctype(sent),
		name: readName(sent),
	});
};

export const getMeta = (params: unknown, extension: InstalledExtension) =>
	invoke("builder.extensions.data.get_meta", {
		extension: extension.name,
		doctype: readDoctype(fields(params)),
	});

export const insert = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.insert_doc", {
		extension: extension.name,
		doctype: readDoctype(sent),
		doc: readDoc(sent.doc),
	});
};

export const update = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.update_doc", {
		extension: extension.name,
		doctype: readDoctype(sent),
		name: readName(sent),
		doc: readDoc(sent.doc),
	});
};

export const remove = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.data.delete_doc", {
		extension: extension.name,
		doctype: readDoctype(sent),
		name: readName(sent),
	});
};

export const documentMethods: MethodTable = {
	"data.getList": { needs: "data.access", run: getList },
	"data.getCount": { needs: "data.access", run: getCount },
	"data.getDoc": { needs: "data.access", run: getDoc },
	"data.getMeta": { needs: "data.access", run: getMeta },
	"data.insert": { needs: "data.access", run: insert },
	"data.update": { needs: "data.access", run: update },
	"data.delete": { needs: "data.access", run: remove },
};
