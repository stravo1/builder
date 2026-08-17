import type { InstalledExtension } from "@/extensions/types";
import { createResource } from "frappe-ui";
import { computed } from "vue";

const extensionsResource = createResource({
	url: "builder.extensions.get_enabled_extensions",
	// losing this list costs the editor its extensions, never the editor itself
	onError: (error: Error) => console.error("Could not load extensions", error),
});

export const installedExtensions = computed<InstalledExtension[]>(() => extensionsResource.data ?? []);

export const loadExtensions = () => extensionsResource.fetch();
