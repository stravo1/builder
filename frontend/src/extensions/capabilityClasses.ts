/**
 * What a capability means to the person answering for it.
 *
 * The bridge reads a capability as a key. A user reads it as a sentence, so the
 * wording lives here and the gate keeps the key. The classes come from milestone
 * 7: a capability is grouped by how far its effect reaches, not by which method
 * it unlocks.
 *
 * One class reaches past this editor session. A token styles every published
 * page, and a doctype holds the site's own data, so granting either is the
 * question `ExtensionGrantDialog` already asks about a doctype.
 */

import type { Capability } from "frappe-builder-extension-sdk/types";

export const SENSITIVE_CLASS = "Shared site state";

type CapabilityDetail = {
	capabilityClass: string;
	/** What it lets the extension do, in one line a user can answer. */
	label: string;
	/** Why allowing it reaches further than this editor session. */
	warning?: string;
};

export const capabilityDetails: Record<Capability, CapabilityDetail> = {
	"context.read": { capabilityClass: "Editor read", label: "See what you have selected" },
	"block.read": { capabilityClass: "Editor read", label: "Read a block on the canvas" },
	"page.read": { capabilityClass: "Editor read", label: "Read the whole page" },
	"block.update": { capabilityClass: "Editor write", label: "Change a block you have selected" },
	"block.insert": { capabilityClass: "Editor write", label: "Add blocks to the page" },
	"page.write": { capabilityClass: "Editor write", label: "Change the page and its client scripts" },
	"ui.dialog": { capabilityClass: "Editor chrome", label: "Open a dialog over the editor" },
	"ui.popover": { capabilityClass: "Editor chrome", label: "Open a popover beside the editor" },
	"data.access": {
		capabilityClass: "Site data",
		label: "Read and write documents on this site",
		warning: "It asks again, by doctype, and it never gets more than your own permissions.",
	},
	"token.write": {
		capabilityClass: SENSITIVE_CLASS,
		label: "Define design tokens",
		warning: "A token it writes styles every page you already published.",
	},
	"schema.write": {
		capabilityClass: SENSITIVE_CLASS,
		label: "Create and drop doctypes",
		warning: "Dropping a doctype drops its table and every record in it. Nothing undoes that.",
	},
};

/** The reading order of the classes, widest reach last. */
const CLASS_ORDER = ["Editor read", "Editor write", "Editor chrome", "Site data", SENSITIVE_CLASS];

const CLASS_SUMMARIES: Record<string, string> = {
	"Editor read": "What it sees while you edit.",
	"Editor write": "What it changes on the page you have open.",
	"Editor chrome": "The windows it opens inside Builder.",
	"Site data": "Documents on this site, one doctype at a time.",
	[SENSITIVE_CLASS]: "Changes that outlive this session and reach every visitor.",
};

export type CapabilityGroup = {
	name: string;
	summary: string;
	sensitive: boolean;
	capabilities: Capability[];
};

export const isSensitive = (capability: Capability) =>
	capabilityDetails[capability]?.capabilityClass === SENSITIVE_CLASS;

/** The classes an extension actually asked for, each holding what it asked for. */
export const groupCapabilities = (capabilities: Capability[]): CapabilityGroup[] =>
	CLASS_ORDER.map((name) => ({
		name,
		summary: CLASS_SUMMARIES[name],
		sensitive: name === SENSITIVE_CLASS,
		capabilities: capabilities.filter(
			(capability) => capabilityDetails[capability]?.capabilityClass === name,
		),
	})).filter((group) => group.capabilities.length);
