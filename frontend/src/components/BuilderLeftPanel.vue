<template>
	<div class="flex">
		<PanelResizer
			:dimension="builderStore.builderLayout.leftPanelWidth"
			side="right"
			:minDimension="200"
			:maxDimension="500"
			@resize="(width) => (builderStore.builderLayout.leftPanelWidth = width)" />
		<div
			class="flex min-h-full flex-col items-center gap-2 border-r border-outline-gray-1 p-3"
			ref="miniSidebar">
			<Tooltip v-for="option of leftPanelOptions" :key="option.value" :text="option.label" placement="right">
				<Button
					:icon="option.icon"
					:class="{
						'!text-ink-gray-6': builderStore.leftPanelActiveTab !== option.value,
					}"
					size="md"
					:variant="
						builderStore.leftPanelActiveTab === option.value ||
						(showVariableManager && option.value === 'variables')
							? 'subtle'
							: 'ghost'
					"
					@click.stop="setActiveTab(option.value as LeftSidebarTabOption)"></Button>
			</Tooltip>
			<div
				v-if="pluginStore.pinnedPlugins.length"
				class="my-1 h-px w-5 bg-outline-gray-2"></div>
			<div
				v-for="plugin in pluginStore.pinnedPlugins"
				:key="plugin.id"
				class="group relative flex items-center justify-center"
				@click.stop="runPinnedPlugin(plugin)">
				<Tooltip :text="plugin.name" placement="right">
					<button
						class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2"
						@click.stop="runPinnedPlugin(plugin)">
						<PluginIcon :plugin="plugin" size="md" />
					</button>
				</Tooltip>
				<button
					class="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-gray-3 text-ink-gray-5 opacity-0 shadow-sm hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
					@click.stop="pluginStore.togglePinnedPlugin(plugin.id)"
					title="Unpin">
					<span class="lucide-x h-2.5 w-2.5" />
				</button>
			</div>
		</div>
		<div
			class="no-scrollbar relative min-h-full overflow-auto"
			:style="{
				width: `${builderStore.builderLayout.leftPanelWidth}px`,
			}"
			@click.stop="
				builderStore.leftPanelActiveTab === 'Layers' && canvasStore.activeCanvas?.clearSelection()
			">
			<div v-show="builderStore.leftPanelActiveTab === 'Blocks'">
				<BuilderBlockTemplates class="px-3 pb-3" />
			</div>
			<div v-show="builderStore.leftPanelActiveTab === 'Assets'">
				<BuilderAssets class="px-3 pb-3" />
			</div>
			<div v-show="builderStore.leftPanelActiveTab === 'Layers'" class="p-3 pr-0">
				<span class="flex items-center gap-2 pb-2 text-sm capitalize text-ink-gray-4">
					<span
						:class="[
							canvasStore.activeCanvas?.canvasProps.breakpoints.find(
								(b) => b.device === canvasStore.activeCanvas?.activeBreakpoint,
							)?.icon || 'lucide-monitor',
							'size-3',
						]"
						aria-hidden="true" />
					{{ canvasStore.activeCanvas?.activeBreakpoint }}
				</span>
				<BlockLayers
					class="block-layers w-fit min-w-full pr-3"
					v-if="pageCanvas"
					:disable-draggable="true"
					:readonly="builderStore.readOnlyMode"
					ref="pageLayers"
					:blocks="[pageCanvas?.getRootBlock() as Block]"
					v-show="canvasStore.editingMode == 'page'" />
				<BlockLayers
					class="block-layers w-fit min-w-full pr-3"
					ref="componentLayers"
					:disable-draggable="true"
					:readonly="builderStore.readOnlyMode"
					:blocks="[fragmentCanvas?.getRootBlock()]"
					:indent="5"
					:adjustForRoot="false"
					v-if="canvasStore.editingMode === 'fragment' && fragmentCanvas" />
			</div>
			<div class="h-full" v-show="builderStore.leftPanelActiveTab === 'Code'">
				<PageScript
					:key="pageStore.selectedPage"
					v-if="pageStore.selectedPage && pageStore.activePage"
					:page="pageStore.activePage" />
			</div>
		</div>

		<VariableManager v-model="showVariableManager" :container="miniSidebar" />
	</div>
</template>
<script setup lang="ts">
import type Block from "@/block";
import LayersIcon from "@/components/Icons/Layers.vue";
import VariableManager from "@/components/Modals/VariableManager.vue";
import PageScript from "@/components/PageScript.vue";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import usePageStore from "@/stores/pageStore";
import PluginIcon from "@/components/PluginIcon.vue";
import usePluginStore from "@/stores/pluginStore";
import { fetchInstalledPlugins } from "@/data/builderPlugins";
import type { PluginBundle } from "@/plugins/api/types";
import { Tooltip } from "frappe-ui";
import { inject, nextTick, onMounted, Ref, ref, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import BlockLayers from "./BlockLayers.vue";
import BuilderAssets from "./BuilderAssets.vue";
import BuilderBlockTemplates from "./BuilderBlockTemplates.vue";
import BuilderCanvas from "./BuilderCanvas.vue";
import PanelResizer from "./PanelResizer.vue";

const showVariableManager = ref(false);
const miniSidebar = ref(null) as Ref<HTMLElement | null>;
const pageLayers = ref<InstanceType<typeof BlockLayers> | null>(null);
const componentLayers = ref<InstanceType<typeof BlockLayers> | null>(null);
const canvasStore = useCanvasStore();
const builderStore = useBuilderStore();
const pageStore = usePageStore();
const pluginStore = usePluginStore();

const pageCanvas = inject("pageCanvas") as Ref<InstanceType<typeof BuilderCanvas> | null>;
const fragmentCanvas = inject("fragmentCanvas") as Ref<InstanceType<typeof BuilderCanvas> | null>;

const route = useRoute();

const leftPanelOptions = [
	{
		label: "Insert",
		value: "Blocks",
		icon: "lucide-plus",
	},
	{
		label: "Layers",
		value: "Layers",
		icon: LayersIcon,
	},
	{
		label: "Components",
		value: "Assets",
		icon: "lucide-box",
	},
	{
		label: "Code",
		value: "Code",
		icon: "lucide-code",
	},
	{
		label: "Variables",
		value: "variables",
		icon: "lucide-aperture",
	},
];

const setActiveTab = (tab: LeftSidebarTabOption) => {
	if (tab === "variables") {
		showVariableManager.value = !showVariableManager.value;
	} else {
		builderStore.leftPanelActiveTab = tab;
		showVariableManager.value = false;
	}
};

async function runPinnedPlugin(plugin: PluginBundle) {
	if (!pluginStore._pluginsLoaded) {
		await loadPlugins();
	}
	pluginStore.runPlugin(plugin);
}

async function loadPlugins() {
	try {
		pluginStore.setPlugins(await fetchInstalledPlugins());
	} catch (error) {
		console.error("Failed to load plugins", error);
	}
}

onMounted(async () => {
	await loadPlugins();
});

watchEffect(() => {
	if (pageLayers.value) {
		builderStore.activeLayers = pageLayers.value;
	} else if (componentLayers.value) {
		builderStore.activeLayers = componentLayers.value;
	}
});

watch(
	() => route.fullPath,
	() => {
		showVariableManager.value = false;
	},
);

watch(
	() => canvasStore.activeCanvas?.hoveredBlock,
	() => {
		document.querySelectorAll(`[data-block-layer-id].hovered-block`).forEach((el) => {
			el.classList.remove("hovered-block");
		});
		if (canvasStore.activeCanvas?.hoveredBlock) {
			document
				.querySelector(`[data-block-layer-id="${canvasStore.activeCanvas.hoveredBlock}"]`)
				?.classList.add("hovered-block");
		}
	},
);

watch(
	() => canvasStore.activeCanvas?.selectedBlockIds,
	async () => {
		await nextTick();
		const selectedBlocks = document.querySelectorAll(`[data-block-layer-id].block-selected`);
		selectedBlocks.forEach((el) => el.classList.remove("block-selected"));
		Array.from(canvasStore.activeCanvas?.selectedBlockIds || new Set([])).forEach((blockId: string) => {
			const blockElement = document.querySelector(`[data-block-layer-id="${blockId}"]`);
			blockElement?.classList.add("block-selected");
		});
	},
	{ deep: true },
);
</script>
