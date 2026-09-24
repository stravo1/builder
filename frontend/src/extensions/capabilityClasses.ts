/**
 * What a capability means to the person answering for it.
 *
 * The bridge reads a capability as a key. A user reads it as a sentence, so the
 * wording lives here and the gate keeps the key. The classes come from milestone
 * 7: a capability is grouped by how far its effect reaches, not by which method
 * it unlocks.
 *
 * Two classes reach past this editor session, so they are sensitive. A doctype
 * holds the site's own data, and a token styles every published page.
 */

import type { Capability } from "frappe-builder-extension-sdk/types";

/** The class whose answers are per doctype, so the panel lists the grants under it. */
export const SITE_DATA_CLASS = "Site data";

export const SHARED_STATE_CLASS = "Site Data";

const SENSITIVE_CLASSES = [SITE_DATA_CLASS, SHARED_STATE_CLASS];

type CapabilityDetail = {
	capabilityClass: string;
	/** What it lets the extension do, in one line a user can answer. */
	label: string;
	/** Why allowing it reaches further than this editor session. */
	warning?: string;
};

export const capabilityDetails: Record<Capability, CapabilityDetail> = {
	"context.read": { capabilityClass: "View", label: "See what you selected" },
	"block.read": { capabilityClass: "View", label: "See blocks on the page" },
	"page.read": { capabilityClass: "View", label: "See the whole page" },
	"block.update": { capabilityClass: "Edit", label: "Edit the selected block" },
	"block.insert": { capabilityClass: "Edit", label: "Add blocks to the page" },
	"page.write": { capabilityClass: "Edit", label: "Edit the page and its scripts" },
	"ui.dialog": { capabilityClass: "Windows", label: "Open dialogs" },
	"ui.popover": { capabilityClass: "Windows", label: "Open popups" },
	"data.access": {
		capabilityClass: SITE_DATA_CLASS,
		label: "See and change site data",
		warning: "It asks you before it uses each type of record. It cannot see more than you can.",
	},
	"token.write": {
		capabilityClass: SHARED_STATE_CLASS,
		label: "Add and edit design tokens",
		warning: "Tokens change how your published pages look.",
	},
	"schema.write": {
		capabilityClass: SHARED_STATE_CLASS,
		label: "Create and delete DocTypes",
		warning: "Deleting a DocType deletes all its records. You cannot undo this.",
	},
};

/** The reading order of the classes, widest reach last. */
const CLASS_ORDER = ["View", "Edit", "Windows", SITE_DATA_CLASS, SHARED_STATE_CLASS];

export const isSensitive = (capability: Capability) =>
	SENSITIVE_CLASSES.includes(capabilityDetails[capability]?.capabilityClass);

/** What an extension asked for, in reading order: the widest reach last. */
export const sortCapabilities = (capabilities: Capability[]): Capability[] =>
	CLASS_ORDER.flatMap((name) =>
		capabilities.filter((capability) => capabilityDetails[capability]?.capabilityClass === name),
	);
