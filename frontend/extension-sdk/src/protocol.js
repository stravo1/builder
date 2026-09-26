/** The extension protocol values shared by the runtime, Vite plugin, and packager. */

export const PROTOCOL_VERSION = 1;

/**
 * Every permission an extension may ask for. Reads and windows need none.
 *
 * @type {readonly ("page.edit" | "page.write" | "token.write" | "data.access" | "schema.write" | "method.call")[]}
 */
export const CAPABILITIES = [
	"page.edit",
	"page.write",
	"token.write",
	"data.access",
	"schema.write",
	"method.call",
];

/**
 * Keys a published manifest may still carry. The two block keys became one, and
 * a read or a window no longer needs a permission, so those map to nothing.
 *
 * @type {Readonly<Record<string, string | null>>}
 */
export const LEGACY_CAPABILITIES = {
	"block.update": "page.edit",
	"block.insert": "page.edit",
	"context.read": null,
	"block.read": null,
	"page.read": null,
	"ui.dialog": null,
	"ui.popover": null,
};

/**
 * Today's keys, in the order asked, with a legacy key mapped or dropped.
 *
 * @param {readonly string[]} keys
 * @returns {typeof CAPABILITIES[number][]}
 */
export const readCapabilities = (keys) => {
	const current = keys.map((key) => (key in LEGACY_CAPABILITIES ? LEGACY_CAPABILITIES[key] : key));
	return /** @type {typeof CAPABILITIES[number][]} */ ([...new Set(current.filter(Boolean))]);
};

const MANIFEST_FIELDS = new Set([
	"v",
	"name",
	"label",
	"description",
	"version",
	"entry",
	"icon",
	"capabilities",
]);

const REQUIRED_MANIFEST_FIELDS = ["v", "name", "label", "description", "version", "entry", "capabilities"];
const EXTENSION_NAME = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const PLAIN_TEXT = /^[^<>\u0000-\u001f\u007f]*$/;

const fail = (source, message) => {
	throw new Error(`[builder] ${source} ${message}`);
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const requireText = (manifest, field, maximum, source) => {
	const value = manifest[field];
	const length = typeof value === "string" ? [...value].length : 0;
	if (!length || length > maximum || value.trim() !== value || !PLAIN_TEXT.test(value)) {
		fail(source, `field "${field}" must contain 1 through ${maximum} plain text characters`);
	}
};

const validateCapabilities = (value, source) => {
	if (!Array.isArray(value)) fail(source, 'field "capabilities" must be a list');
	if (new Set(value).size !== value.length) fail(source, 'field "capabilities" must not contain duplicates');
	const unknown = value.find(
		(capability) => !CAPABILITIES.includes(capability) && !(capability in LEGACY_CAPABILITIES),
	);
	if (unknown !== undefined) fail(source, `requests unknown capability "${String(unknown)}"`);
};

export const parseJson = (source, text) => {
	try {
		return JSON.parse(text);
	} catch (error) {
		fail(source, `is not valid JSON: ${error.message}`);
	}
};

export const isSemver = (value) => typeof value === "string" && SEMVER.test(value);

export const validateManifest = (value, source = "manifest.json") => {
	if (!isObject(value)) fail(source, "must contain one JSON object");

	const missing = REQUIRED_MANIFEST_FIELDS.find((field) => !Object.hasOwn(value, field));
	if (missing) fail(source, `has no required field "${missing}"`);

	const unknown = Object.keys(value).find((field) => !MANIFEST_FIELDS.has(field));
	if (unknown) fail(source, `contains unknown field "${unknown}"`);

	if (value.v !== PROTOCOL_VERSION) fail(source, `field "v" must equal ${PROTOCOL_VERSION}`);
	if (typeof value.name !== "string" || !EXTENSION_NAME.test(value.name)) {
		fail(source, 'field "name" must use the lowercase "publisher/name" form');
	}
	requireText(value, "label", 80, source);
	requireText(value, "description", 240, source);
	if (!isSemver(value.version)) fail(source, 'field "version" must be SemVer without a "v" prefix');
	if (value.entry !== "main.js") fail(source, 'field "entry" must equal "main.js"');
	if (value.icon !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/.test(value.icon)) {
		fail(source, 'field "icon" must name one root SVG file');
	}
	validateCapabilities(value.capabilities, source);
	return value;
};
