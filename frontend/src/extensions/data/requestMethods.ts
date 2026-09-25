/**
 * frappe-ui's requests, read on the trusted side.
 *
 * The SDK wraps the frame's `fetch` and sends every `/api/method/*` and
 * `/api/v2/*` request here unread. This file decides which operation a request
 * is and hands it to the `data.*` method that already gates that operation, so a
 * request reaches exactly what the matching SDK call reaches.
 *
 * A request that matches no route is refused, never forwarded. Forwarding would
 * let a frame name any whitelisted method on the site, and the doctype grant
 * would stop meaning anything. `frappe.client.*` is read here as the CRUD it is,
 * never as a method, for the same reason.
 */

import type { ApiAnswer, InstalledExtension } from "frappe-builder-extension-sdk/types";
import type { MethodTable } from "../host/capabilities";
import { fields, refuse, text, wholeNumber } from "../params";
import { getCount, getDoc, getList, getMeta, insert, remove, update } from "./documentMethods";

type Params = Record<string, unknown>;

/** One request, parsed. `params` merges the query and the body, the way Frappe's `form_dict` does. */
type ApiCall = { verb: string; path: string[]; params: Params };

type Route = (call: ApiCall, extension: InstalledExtension) => Promise<ApiAnswer>;

/** Frappe's own page size when a v2 list names none. */
const V2_PAGE_LENGTH = 20;

const readBody = (body: unknown): Params => {
	if (body === undefined) return {};
	try {
		const parsed = JSON.parse(text(body, "body"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch {
		// refused below, with the same message as a body that parsed to a list
	}
	throw refuse("A request body must be a JSON object.", "invalid_params");
};

/** A query string cannot say "no value", so frappe-ui leaves out a null and may send an empty string. */
const withoutEmpty = (params: Params) =>
	Object.fromEntries(Object.entries(params).filter(([, value]) => value !== null && value !== ""));

/** Split before decoding, so a name holding an encoded slash stays one segment. */
const readCall = (params: unknown): ApiCall => {
	const sent = fields(params);
	const url = new URL(text(sent.url, "url"), "http://frame.invalid");
	return {
		verb: text(sent.method, "method").toUpperCase(),
		path: url.pathname.split("/").filter(Boolean).map(decodeURIComponent),
		params: withoutEmpty({ ...Object.fromEntries(url.searchParams), ...readBody(sent.body) }),
	};
};

/** A query string carries a list or a dict as JSON text. A body carries it as itself. */
const decoded = (value: unknown) => {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

/** A query string carries a number as text. Anything else reaches the validator as it came. */
const number = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);

const answer = (result: Promise<unknown>): Promise<ApiAnswer> => result.then((data) => ({ data }));

const unsupported = (call: ApiCall) =>
	refuse(
		`No route for ${call.verb} /${call.path.join("/")}. An extension reaches site data ` +
			`through a doctype it was granted.`,
		"unsupported_request",
	);

/** A child table is read through its parent's permission, so a grant on the child would answer nothing. */
const refuseParent = (params: Params) => {
	if (params.parent) {
		throw refuse('"parent" is not supported: grant the parent doctype instead.', "unsupported_request");
	}
};

const listOptions = (params: Params, doctype: unknown) => {
	refuseParent(params);
	return {
		doctype,
		fields: decoded(params.fields),
		filters: decoded(params.filters),
		orFilters: decoded(params.or_filters),
		orderBy: params.order_by,
		groupBy: params.group_by,
	};
};

/**
 * `set_value` carries its patch as `fieldname`, which is an object from every
 * frappe-ui path. The one-field form, `fieldname` plus `value`, is what a
 * hand-written call sends, so both are read here.
 */
const patchOf = (params: Params) => {
	const sent = decoded(params.fieldname);
	return typeof sent === "string" ? { [sent]: params.value } : sent;
};

const CLIENT_ROUTES: Record<string, Route> = {
	"frappe.client.get_list": ({ params }, extension) =>
		answer(
			getList(
				{
					...listOptions(params, params.doctype),
					start: number(params.limit_start),
					pageLength: number(params.limit_page_length),
				},
				extension,
			),
		),

	"frappe.client.get_count": ({ params }, extension) =>
		answer(getCount({ doctype: params.doctype, filters: decoded(params.filters) }, extension)),

	"frappe.client.get": ({ params }, extension) =>
		answer(getDoc({ doctype: params.doctype, name: params.name }, extension)),

	// the doctype travels inside the document here, not beside it
	"frappe.client.insert": ({ params }, extension) => {
		const doc = decoded(params.doc);
		return answer(insert({ doctype: fields(doc).doctype, doc }, extension));
	},

	"frappe.client.set_value": ({ params }, extension) =>
		answer(update({ doctype: params.doctype, name: params.name, doc: patchOf(params) }, extension)),

	"frappe.client.delete": ({ params }, extension) =>
		answer(remove({ doctype: params.doctype, name: params.name }, extension)),
};

/**
 * v2 pages by `has_next_page`, which Frappe answers by fetching one row more
 * than the page. The server's ceiling applies to that larger number, so a v2
 * page holds at most one row less than a v1 page.
 */
const listPage = async ({ params }: ApiCall, doctype: string, extension: InstalledExtension) => {
	const limit = wholeNumber(number(params.limit ?? V2_PAGE_LENGTH), "limit");
	const options = { ...listOptions(params, doctype), start: number(params.start), pageLength: limit + 1 };
	const rows = (await getList(options, extension)) as unknown[];
	return { data: rows.slice(0, limit), hasNextPage: rows.length > limit };
};

type DocumentRoute = (
	call: ApiCall,
	doctype: string,
	name: string,
	extension: InstalledExtension,
) => Promise<ApiAnswer>;

const V2_LIST_ROUTES: Record<string, DocumentRoute> = {
	GET: (call, doctype, _name, extension) => listPage(call, doctype, extension),
	POST: ({ params }, doctype, _name, extension) => answer(insert({ doctype, doc: params }, extension)),
};

const updateDocument: DocumentRoute = ({ params }, doctype, name, extension) =>
	answer(update({ doctype, name, doc: params }, extension));

const V2_DOCUMENT_ROUTES: Record<string, DocumentRoute> = {
	GET: (_call, doctype, name, extension) => answer(getDoc({ doctype, name }, extension)),
	PUT: updateDocument,
	PATCH: updateDocument,
	// Frappe answers a v2 delete with "ok", and a client may compare against it
	DELETE: (_call, doctype, name, extension) =>
		remove({ doctype, name }, extension).then(() => ({ data: "ok" })),
};

const V2_DOCTYPE_ROUTES: Record<string, Route> = {
	count: ({ params, path }, extension) =>
		answer(getCount({ doctype: path[3], filters: decoded(params.filters) }, extension)),
	meta: ({ path }, extension) => answer(getMeta({ doctype: path[3] }, extension)),
};

/** `copy`, `bulk_*` and `method/<name>` sit under a document's path, and none has a route yet. */
const isSubresource = (rest: string[]) =>
	rest.length > 1 && (rest[rest.length - 1] === "copy" || rest[rest.length - 2] === "method");

const findDocumentRoute = (call: ApiCall, rest: string[]) => {
	if (isSubresource(rest)) return undefined;
	return (rest.length ? V2_DOCUMENT_ROUTES : V2_LIST_ROUTES)[call.verb];
};

const version2Route = (call: ApiCall, extension: InstalledExtension) => {
	const [resource, doctype, ...rest] = call.path.slice(2);
	if (resource === "document" && doctype) {
		const route = findDocumentRoute(call, rest);
		if (route) return route(call, doctype, rest.join("/"), extension);
	}
	const doctypeRoute = resource === "doctype" && rest.length === 1 && V2_DOCTYPE_ROUTES[rest[0]];
	if (doctypeRoute && call.verb === "GET") return doctypeRoute(call, extension);
	throw unsupported(call);
};

const findRoute = (call: ApiCall): Route => {
	const [api, family, ...rest] = call.path;
	if (api === "api" && family === "v2") return version2Route;
	const route = api === "api" && family === "method" && CLIENT_ROUTES[rest.join("/")];
	if (route) return route;
	throw unsupported(call);
};

const request = (params: unknown, extension: InstalledExtension) => {
	const call = readCall(params);
	return findRoute(call)(call, extension);
};

export const requestMethods: MethodTable = {
	"data.request": { needs: "data.access", run: request },
};
