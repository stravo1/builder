<template>
	<Popover placement="bottom-end" popoverClass="!mt-[12px]">
		<template #target="{ togglePopover }">
			<Tooltip text="Plugins" :hoverDelay="0.6" arrow-class="mb-3">
				<Button
					variant="ghost"
					icon="lucide-plug"
					:disabled="disabled"
					@click="(e) => openMenu(e, togglePopover)" />
			</Tooltip>
		</template>
		<template #body="{ close }">
			<div
				class="flex w-64 flex-col overflow-hidden rounded-lg bg-surface-white shadow-lg ring-1 ring-black/5">
				<div class="border-b border-outline-gray-1 px-3 py-2.5">
					<p class="text-xs font-medium text-ink-gray-5">Plugins</p>
				</div>
				<div
					v-if="showSearchInput"
					class="border-b border-outline-gray-1 px-2 py-2">
					<BuilderInput
						type="text"
						placeholder="Search plugin"
						v-model="pluginFilter"
						@input="(value: string) => (pluginFilter = value)" />
				</div>
				<div class="max-h-[min(360px,50vh)] overflow-y-auto p-1.5">
					<div v-if="loading" class="px-2 py-3 text-sm text-ink-gray-5">Loading plugins...</div>
					<div
						v-else-if="!filteredPlugins.length"
						class="px-2 py-6 text-center text-sm text-ink-gray-5">
						{{ pluginStore.enabledPlugins.length ? "No matching plugins" : "No plugins installed" }}
					</div>
					<div v-for="plugin in filteredPlugins" :key="plugin.id" class="group">
						<ItemListRow
							class="w-full cursor-pointer"
							:active="pluginStore.activePlugin?.id === plugin.id"
							@click="runPlugin(plugin, close)">
							<template #prefix>
								<PluginIcon :plugin="plugin" size="sm" class="text-ink-gray-5" />
							</template>
							<span class="block truncate">{{ plugin.name }}</span>
							<template #suffix>
								<Badge v-if="plugin.isDev" variant="subtle" theme="blue" class="shrink-0">
									DEV
								</Badge>
								<button
									type="button"
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-gray-5 transition-opacity hover:bg-surface-gray-3 hover:text-ink-gray-8"
									:class="
										pluginStore.isPluginPinned(plugin.id)
											? 'pointer-events-auto text-ink-blue-3 opacity-100'
											: 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
									"
									@click.stop="pluginStore.togglePinnedPlugin(plugin.id)"
									:title="
										pluginStore.isPluginPinned(plugin.id)
											? 'Unpin from sidebar'
											: 'Pin to sidebar'
									">
									<span
										class="lucide-pin-off size-3.5"
										v-if="pluginStore.isPluginPinned(plugin.id)"
										aria-hidden="true" />
									<span class="lucide-pin size-3.5" v-else aria-hidden="true" />
								</button>
							</template>
						</ItemListRow>
					</div>
				</div>
			</div>
		</template>
	</Popover>
</template>

<script setup lang="ts">
import type { PluginBundle } from "@/plugins/api/types";
import { fetchInstalledPlugins } from "@/data/builderPlugins";
import usePluginStore from "@/stores/pluginStore";
import PluginIcon from "@/components/PluginIcon.vue";
import { Badge, ItemListRow, Popover, Button, Tooltip } from "frappe-ui";
import { computed, ref } from "vue";

defineProps<{
	disabled?: boolean;
}>();

const pluginStore = usePluginStore();
const loading = ref(false);
const pluginFilter = ref("");

const filteredPlugins = computed(() => {
	const query = pluginFilter.value.trim().toLowerCase();
	return pluginStore.enabledPlugins.filter((plugin) => {
		if (!query) return true;
		return plugin.name.toLowerCase().includes(query);
	});
});

const showSearchInput = computed(() => {
	return pluginStore.enabledPlugins.length > 8 || pluginFilter.value.length > 0;
});

async function loadPlugins() {
	loading.value = true;
	try {
		pluginStore.setPlugins(await fetchInstalledPlugins());
	} catch (error) {
		console.error("Failed to refresh plugins", error);
	} finally {
		loading.value = false;
	}
}

async function openMenu(e: MouseEvent, togglePopover: () => void) {
	(e.currentTarget as HTMLElement)?.blur();
	if (!pluginStore._pluginsLoaded) {
		await loadPlugins();
	}
	togglePopover();
}

async function runPlugin(plugin: PluginBundle, close: () => void) {
	close();
	await pluginStore.runPlugin(plugin);
}
</script>
