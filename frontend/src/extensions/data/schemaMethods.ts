/**
 * Doctypes an extension creates while the editor runs.
 *
 * `schema.write` says the site allowed this extension to model tables at all.
 * Frappe wants create permission on `DocType`, which is System Manager, so an
 * extension asking a page editor to model a table fails, and that is the right
 * answer. Dropping a table asks the user first, because it takes every record
 * with it and cannot be undone.
 *
 * Ownership is a record, not a naming convention. Only the extension that made
 * a doctype may change or drop it: reading a table is not reshaping it.
 *
 * Not a page write, so read-only mode does not refuse any of it — a table is
 * not the page being edited.
 */

import { createResource } from "frappe-ui";
import type { MethodTable } from "../host/capabilities";
import { fields, flag, oneOf, refuse, text } from "../params";
import { confirm } from "@/utils/helpers";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const NAMING = ["hash", "autoincrement", "prompt"] as const;

/** Rebuilt plain, because `createResource` answers with its reactive `data`. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const asRefusal = (thrown: unknown) => {
	const sent = thrown as { messages?: string[]; message?: string };
	return refuse(sent.messages?.[0] || sent.message || "The server refused that call.", "server_error");
};

const invoke = (url: string, params: Record<string, unknown>) =>
	createResource({ url })
		.submit(params)
		.then(plain)
		.catch((thrown: unknown) => {
			throw asRefusal(thrown);
		});

/**
 * A field list, checked for shape only. Which field types are allowed is the
 * server's rule, so there is one list rather than two that drift.
 */
const readFields = (value: unknown) => {
	if (!Array.isArray(value) || !value.length) {
		throw refuse('"fields" must be a non-empty list.', "invalid_params");
	}
	return value.map((field) => {
		if (!field || typeof field !== "object" || Array.isArray(field)) {
			throw refuse("Every field must be an object.", "invalid_params");
		}
		return field as Record<string, unknown>;
	});
};

const createDoctype = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	const doctype = text(sent.doctype, "doctype");
	const rows = readFields(sent.fields);
	const naming = sent.naming === undefined ? "hash" : oneOf(sent.naming, NAMING, "naming");

	return invoke("builder.extensions.schema.create_doctype", {
		extension: extension.name,
		doctype,
		fields: rows,
		naming,
		istable: flag(sent.istable, false),
	});
};

const getDoctype = (params: unknown, extension: InstalledExtension) =>
	invoke("builder.extensions.schema.get_doctype", {
		extension: extension.name,
		doctype: text(fields(params).doctype, "doctype"),
	});

/** Adds fields and updates them by fieldname. Never removes one, so no column is dropped. */
const updateDoctype = (params: unknown, extension: InstalledExtension) => {
	const sent = fields(params);
	return invoke("builder.extensions.schema.update_doctype", {
		extension: extension.name,
		doctype: text(sent.doctype, "doctype"),
		fields: readFields(sent.fields),
	});
};

const deleteDoctype = async (params: unknown, extension: InstalledExtension) => {
	const doctype = text(fields(params).doctype, "doctype");

	const message = `${extension.label} wants to delete ${doctype} and all its records.`;
	if (!(await confirm(message, `Delete ${doctype}?`))) {
		throw refuse(`The user did not allow "${extension.name}" to delete ${doctype}.`, "refused");
	}

	return invoke("builder.extensions.schema.delete_doctype", {
		extension: extension.name,
		doctype,
	});
};

const listDoctypes = (_params: unknown, extension: InstalledExtension) =>
	invoke("builder.extensions.schema.list_doctypes", { extension: extension.name });

export const schemaMethods: MethodTable = {
	"schema.createDoctype": { needs: "schema.write", run: createDoctype },
	"schema.getDoctype": { needs: "schema.write", run: getDoctype },
	"schema.updateDoctype": { needs: "schema.write", run: updateDoctype },
	"schema.deleteDoctype": { needs: "schema.write", run: deleteDoctype },
	"schema.listDoctypes": { needs: "schema.write", run: listDoctypes },
};
