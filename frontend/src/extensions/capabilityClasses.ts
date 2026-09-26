/**
 * What a capability means to the person answering for it.
 *
 * The bridge reads a capability as a key. A user reads it as a sentence, so the
 * wording lives here and the gate keeps the key. A permission that reaches past
 * the editor carries a one-line warning, and the panel asks before turning it on.
 */

import { CAPABILITIES, type Capability } from "frappe-builder-extension-sdk/types";

type CapabilityDetail = {
	/** What it lets the extension do, in one line a user can answer. */
	label: string;
	/** Why allowing it reaches further than this editor session. */
	warning?: string;
};

export const capabilityDetails: Record<Capability, CapabilityDetail> = {
	"page.edit": { label: "Edit pages" },
	"page.write": { label: "Add scripts to pages", warning: "Scripts run for every visitor." },
	"token.write": { label: "Change design tokens", warning: "Tokens change how your published pages look." },
	"data.access": { label: "Access records in the site", warning: "It can read and change what you can." },
	"schema.write": { label: "Create and delete DocTypes", warning: "Deleting a DocType deletes its records." },
	"method.call": { label: "Run actions from installed apps", warning: "It can run what you can run." },
};

export const isSensitive = (capability: Capability) => Boolean(capabilityDetails[capability]?.warning);

/** What an extension asked for, in reading order: the widest reach last. */
export const sortCapabilities = (capabilities: Capability[]): Capability[] =>
	CAPABILITIES.filter((capability) => capabilities.includes(capability));
