import { devExtension } from "@/extensions/devExtension";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { call, createResource } from "frappe-ui";
import { computed } from "vue";

const extensionsResource = createResource({
	url: "builder.extensions.registry.get_enabled_extensions",
	// losing this list costs the editor its extensions, never the editor itself
	onError: (error: Error) => console.error("Could not load extensions", error),
});

/**
 * Every extension this user runs: their own installations, plus the one loaded
 * from a dev server this session.
 *
 * A dev extension replaces the installation of the same name, because developing
 * an extension that is also installed is the ordinary case. Two entries under one
 * name would give it two entry frames and one dispatcher.
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
 * The editor reads it, not the frame. A frame runs at an opaque origin and sends
 * no session, so no route can tell one user's request for their own copy from
 * anyone else's.
 *
 * Fetched once and shared by the five frames that may mount one extension. The
 * checksum joins the key, so a rebuild is fetched again rather than answered from
 * the copy the editor already holds. A failed fetch is dropped, so a reload of
 * the frame asks again instead of replaying the error forever.
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
