/**
 * An extension served from its author's dev server, for this session only (1.14).
 *
 * It has no record and no files. The editor asks the dev server what it is
 * serving, and appends one entry to the installed list — which is all the rest of
 * the host reads, so the entry frame, the surfaces, the dispatcher and the
 * teardown need no idea that this one was never installed.
 *
 * A reload drops it, because loading one is a deliberate act and a stale dev
 * extension that fails to load looks like Builder being broken. The last URL is
 * remembered, so nobody retypes it.
 */

import { CAPABILITIES, type Capability, type InstalledExtension } from "frappe-builder-extension-sdk/types";
import { ref } from "vue";

/** Served by the build plugin, and by nothing else. */
const DESCRIPTOR_PATH = "/__builder-extension";

const LAST_URL_KEY = "builder-extension:dev-url";
const REMOVE_METHOD = "/api/method/builder.extensions.remove_dev_extension";

/** One at a time: a second load replaces the first, as one dialog replaces another. */
export const devExtension = ref<InstalledExtension | null>(null);

export const showDevExtensionDialog = ref(false);

export const lastDevUrl = () => localStorage.getItem(LAST_URL_KEY) ?? "";

/** The installed list carries the dev entry under its own name, so the name is the test. */
export const isDevExtension = (extension: InstalledExtension) => devExtension.value?.name === extension.name;

/**
 * A capability this Builder does not know is a version gap, not a fault, so the
 * extension loses that one grant and keeps the rest. Using it is refused by the
 * bridge, as it would be for an installed extension.
 */
const grantedFrom = (asked: unknown): Capability[] => {
	const list = Array.isArray(asked) ? asked : [];
	const unknown = list.filter((capability) => !CAPABILITIES.includes(capability));
	if (unknown.length) {
		console.warn(`[builder] this Builder has no ${unknown.join(", ")}, so they are not granted`);
	}
	return list.filter((capability): capability is Capability => CAPABILITIES.includes(capability));
};

const read = async (origin: string) => {
	const response = await fetch(`${origin}${DESCRIPTOR_PATH}`).catch(() => {
		throw new Error(`Nothing is answering at ${origin}. Is the dev server running?`);
	});
	const descriptor = response.ok ? await response.json().catch(() => null) : null;
	if (!descriptor?.name) {
		throw new Error(
			`${origin} is not a Builder extension dev server. Add builderExtension() to its vite.config.js.`,
		);
	}
	return descriptor;
};

const remove = (extension: InstalledExtension) =>
	fetch(REMOVE_METHOD, {
		method: "POST",
		body: new URLSearchParams({ extension: extension.name }),
		keepalive: true,
	}).catch((error) => console.error(`Could not remove development extension "${extension.name}"`, error));

/** Takes any URL on the dev server, because an author pastes what the terminal printed. */
export const loadDevExtension = async (url: string): Promise<InstalledExtension> => {
	const origin = new URL(url.trim()).origin;
	const descriptor = await read(origin);
	if (devExtension.value) await remove(devExtension.value);

	localStorage.setItem(LAST_URL_KEY, origin);
	devExtension.value = {
		name: descriptor.name,
		label: descriptor.label || descriptor.name,
		// the dev server serves the source entry, so the path comes from it
		entry: `${origin}${descriptor.entry}`,
		capabilities: grantedFrom(descriptor.capabilities),
	};
	return devExtension.value;
};

export const stopDevExtension = () => {
	if (devExtension.value) void remove(devExtension.value);
	devExtension.value = null;
};

window.addEventListener("pagehide", stopDevExtension);
