import type { PluginBundle } from "@/plugins/api/types";
import { normalizePluginIcon } from "@/stores/pluginStore";

const ASSET_ICON_PATTERN = /\.(png|jpe?g|webp|gif|svg)$/i;

export function isPluginAssetIcon(icon?: string | null): boolean {
	if (!icon) return false;
	if (icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/")) {
		return ASSET_ICON_PATTERN.test(icon) || icon.includes("/files/");
	}
	return ASSET_ICON_PATTERN.test(icon) || icon.includes("/");
}

export function getPluginIconUrl(plugin: PluginBundle): string | null {
	if (plugin.iconUrl) return plugin.iconUrl;
	const manifestIcon = plugin.manifest.icon;
	if (manifestIcon && isPluginAssetIcon(manifestIcon)) {
		return `/api/method/builder.api.plugin.get_plugin_asset?plugin_id=${encodeURIComponent(plugin.id)}&path=${encodeURIComponent(manifestIcon)}`;
	}
	return null;
}

export function getPluginLucideIcon(plugin: PluginBundle): string {
	if (getPluginIconUrl(plugin)) return "lucide-puzzle";
	const icon = plugin.icon || plugin.manifest.icon;
	if (!icon || isPluginAssetIcon(icon)) return "lucide-puzzle";
	return normalizePluginIcon(icon);
}
