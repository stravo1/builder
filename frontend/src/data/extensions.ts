import { devExtension } from "@/extensions/devExtension";
import type { InstalledExtension } from "@/extensions/types";
import { createResource } from "frappe-ui";
import { computed } from "vue";

const extensionsResource = createResource({
	url: "builder.extensions.get_enabled_extensions",
	// losing this list costs the editor its extensions, never the editor itself
	onError: (error: Error) => console.error("Could not load extensions", error),
});

/**
 * Every extension the editor runs: the enabled records, plus the one loaded from
 * a dev server this session.
 *
 * A dev extension replaces the installed record of the same name, because
 * developing an extension that is also installed is the ordinary case. Two
 * entries under one name would give it two entry frames and one dispatcher.
 */
export const installedExtensions = computed<InstalledExtension[]>(() => {
	const installed: InstalledExtension[] = extensionsResource.data ?? [];
	const development = devExtension.value;
	if (!development) return installed;

	return [...installed.filter((extension) => extension.name !== development.name), development];
});

export const loadExtensions = () => extensionsResource.fetch();
