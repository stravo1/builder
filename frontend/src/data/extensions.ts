import { devExtension } from "@/extensions/devExtension";
import type { Capability, InstalledExtension } from "frappe-builder-extension-sdk/types";
import { call, createResource } from "frappe-ui";
import { computed } from "vue";

const METHOD = "builder.extensions.installations";

const extensionsResource = createResource({
	url: "builder.extensions.registry.get_enabled_extensions",
	// losing this list costs the editor its extensions, never the editor itself
	onError: (error: Error) => console.error("Could not load extensions", error),
});

/**
 * Every extension this user runs: their installations, plus the one loaded from a
 * dev server this session. A dev extension replaces the installation of the same
 * name, because two entries would give it two frames.
 */
export const installedExtensions = computed<InstalledExtension[]>(() => {
	const installed: InstalledExtension[] = extensionsResource.data ?? [];
	const development = devExtension.value;
	if (!development) return installed;

	return [...installed.filter((extension) => extension.name !== development.name), development];
});

export const loadExtensions = () => extensionsResource.fetch();

/**
 * The built entry of one installation, which a frame runs from a Blob.
 *
 * The editor reads it, not the frame, because a frame sends no session. Fetched
 * once and shared by the five frames that mount one extension. The checksum joins
 * the key, so a rebuild is fetched again. A failed fetch is dropped, so a
 * reloaded frame asks rather than replaying the error.
 */
const sources = new Map<string, Promise<string>>();

export const extensionSource = (extension: InstalledExtension): Promise<string> => {
	const key = `${extension.name}@${extension.checksum ?? ""}`;

	const cached = sources.get(key);
	if (cached) return cached;

	const reading = call("builder.extensions.registry.get_extension_source", {
		extension: extension.name,
	}) as Promise<string>;

	const source = reading.catch((error: Error) => {
		sources.delete(key);
		throw error;
	});
	sources.set(key, source);
	return source;
};

/**
 * One installation as the Extensions panel reads it.
 *
 * Not `InstalledExtension`: that is the wire shape an extension's own code sees,
 * and a version number or an install date is none of its business. This carries
 * what the panel shows and the editor never needs.
 */
export type UserInstallation = {
	name: string;
	label?: string;
	description?: string;
	icon?: string;
	/** Empty for the dev extension, which runs from a server rather than a release. */
	version: string;
	/** The Builder Hub it came from. Empty for an extension installed from a directory. */
	source_url: string;
	enabled: boolean;
};

/** One doctype this user answered for, as `Builder Extension Grant` holds it. */
export type ExtensionGrant = {
	document_type: string;
	can_read: number;
	can_write: number;
	can_delete: number;
	denied: number;
};

export type InstallationDetails = UserInstallation & {
	installed_on: string;
	readme?: string;
	requested_capabilities: Capability[];
	granted_capabilities: Capability[];
	grants: ExtensionGrant[];
};

/**
 * What the panel manages, which is not what the editor mounts.
 *
 * `installedExtensions` drops a disabled installation, because a frame must not
 * run for one. The panel keeps it, because turning it back on is the point.
 */
const installationsResource = createResource({
	url: "builder.extensions.installations.get_user_installations",
	onError: (error: Error) => console.error("Could not load installations", error),
});

export const userInstallations = computed<UserInstallation[]>(() => {
	const installed: UserInstallation[] = installationsResource.data ?? [];
	const development = devExtension.value;
	if (!development) return installed;

	// The server leaves a development installation out, so the browser's own entry
	// is the only row for it, exactly as it is in the mount list.
	return [
		...installed.filter((row) => row.name !== development.name),
		{
			name: development.name,
			label: development.label,
			description: development.description,
			icon: development.icon,
			version: "",
			source_url: "",
			enabled: true,
		},
	];
});

export const loadUserInstallations = () => installationsResource.fetch();

/**
 * Both lists, after a change to an installation.
 *
 * Enabling, disabling and uninstalling all move an extension between the two, and
 * a grant change remounts its frames, so neither list may be refreshed alone.
 */
export const reloadExtensions = async () => {
	await Promise.all([extensionsResource.fetch(), installationsResource.fetch()]);
};

export const installationDetails = (extension: string) =>
	call(`${METHOD}.get_installation`, { extension }) as Promise<InstallationDetails>;

/** What the site keeps when a user removes an extension. */
export type UninstallSummary = {
	resources: { resource_type: string; count: number }[];
	tokens: number;
	other_users: number;
};

/**
 * Every write below reloads both lists, so no caller can leave the panel showing
 * one answer and the editor running another.
 */
export const setExtensionEnabled = async (extension: string, enabled: boolean) => {
	await call(`${METHOD}.set_extension_enabled`, { extension, enabled });
	await reloadExtensions();
};

export const setGrantedCapabilities = async (extension: string, capabilities: Capability[]) => {
	const granted = (await call(`${METHOD}.set_granted_capabilities`, {
		extension,
		capabilities,
	})) as Capability[];
	await reloadExtensions();
	return granted;
};

export const uninstallSummary = (extension: string) =>
	call(`${METHOD}.get_uninstall_summary`, { extension }) as Promise<UninstallSummary>;

export const uninstallExtension = async (extension: string) => {
	await call(`${METHOD}.uninstall_extension`, { extension });
	await reloadExtensions();
};
