import type { PluginBundle } from "@/plugins/api/types";
import { createResource } from "frappe-ui";

const pluginListResource = createResource({
	url: "builder.api.plugin.list_plugins",
	auto: false,
});

const pluginBundleResource = createResource({
	url: "builder.api.plugin.get_plugin_bundle",
	auto: false,
});

export async function fetchInstalledPlugins(): Promise<PluginBundle[]> {
	const plugins = (await pluginListResource.fetch()) as PluginBundle[];
	return plugins || [];
}

export async function fetchPluginBundle(pluginId: string): Promise<PluginBundle> {
	return (await pluginBundleResource.fetch({ plugin_id: pluginId })) as PluginBundle;
}

export { pluginListResource, pluginBundleResource };
