/**
 * Server methods an extension runs, and how it asks to.
 *
 * `method.call` says an extension may run server methods at all. A method grant
 * says which: one method, or every method of the app that owns it, and the user
 * answers it here, behind a button the extension drew. The rule and the floor
 * live in `builder/extensions/methods.py`, so nothing here decides who may run
 * what.
 *
 * An extension calls a method through frappe-ui or `fetch`, never through a
 * method of its own here: `requestMethods.ts` routes the call to `runMethod` or
 * `runDocMethod`. What this table adds is the asking.
 */

import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import type { MethodTable } from "../host/capabilities";
import { fields, text } from "../params";
import { invoke } from "./documentMethods";
import { confirmMethod, type AccessAnswer, type PromptReply } from "./grants";

const METHODS = "builder.extensions.methods";

/** What the server says about one method, and what the consent prompt shows. */
export type MethodGrant = {
	method: string;
	app: string;
	/** What the app calls itself, which the prompt shows in place of its package name. */
	app_title: string;
	description: string;
	answer: AccessAnswer;
};

const readMethod = (params: unknown) => text(fields(params).method, "method");

const readGrant = (extension: InstalledExtension, method: string) =>
	invoke(`${METHODS}.get_method_grant`, { extension: extension.name, method }) as Promise<MethodGrant>;

const recordAnswer = (extension: InstalledExtension, method: string) => (reply: PromptReply) =>
	invoke(`${METHODS}.record_method_grant`, {
		extension: extension.name,
		method,
		scope: reply.scope,
		denied: !reply.granted,
	}) as Promise<MethodGrant>;

/**
 * Asks only when nobody answered, for the method or for its app. A denial is
 * not asked about again until the user changes it in the Extensions panel.
 */
const requestAccess = async (params: unknown, extension: InstalledExtension) => {
	const method = readMethod(params);
	const current = await readGrant(extension, method);
	if (current.answer !== "not asked") return current;

	return confirmMethod(extension, { ...current, app: current.app_title }, recordAnswer(extension, method));
};

const getAccess = (params: unknown, extension: InstalledExtension) =>
	readGrant(extension, readMethod(params));

/** A module method, or a function in a doctype's controller module. */
export const runMethod = (extension: InstalledExtension, method: string, verb: string, args: unknown) =>
	invoke(`${METHODS}.run_method`, { extension: extension.name, method, verb, args });

/** Answers `{ message, docs }`: frappe-ui's document resource reads the refreshed document from `docs`. */
export const runDocMethod = (
	extension: InstalledExtension,
	target: { doctype: unknown; name: unknown; method: unknown },
	verb: string,
	args: unknown,
) =>
	invoke(`${METHODS}.run_doc_method`, { extension: extension.name, ...target, verb, args }) as Promise<{
		message: unknown;
		docs: unknown[];
	}>;

export const methodMethods: MethodTable = {
	"methods.requestAccess": { needs: "method.call", run: requestAccess },
	"methods.getAccess": { needs: "method.call", run: getAccess },
};
