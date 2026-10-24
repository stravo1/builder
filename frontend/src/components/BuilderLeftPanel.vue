<template>
	<div class="flex">
		<PanelResizer
			:dimension="builderStore.builderLayout.leftPanelWidth"
			side="right"
			:minDimension="minWidth"
			:maxDimension="500"
			@resize="(width) => (builderStore.builderLayout.leftPanelWidth = width)" />
		<div class="flex min-h-full flex-col items-center border-r border-outline-gray-1 p-3" ref="miniSidebar">
			<!-- drawer tabs sit at the bottom of the rail -->
			<div
				v-for="(group, index) of [panelTabs, drawerTabs]"
				:key="index"
				class="flex flex-col items-center gap-2"
				:class="{ 'mt-auto border-t border-outline-gray-1 pt-3': index === 1 && group.length }">
				<Tooltip v-for="tab of group" :key="tab.name" side="right">
					<template #content>
						<span class="flex items-center gap-1.5">
							{{ tab.label }}
							<KeyboardShortcut v-if="tab.shortcut" :combo="tab.shortcut" class="!text-xs !text-ink-gray-4" />
						</span>
					</template>
					<Button
						:icon="tab.icon"
						size="md"
						:class="{ '!text-ink-gray-6': !isActive(tab) }"
						:variant="getVariant(tab)"
						:disabled="isHidden(tab)"
						@click.stop="select(tab)"></Button>
				</Tooltip>
			</div>
		</div>
		<div
			class="no-scrollbar relative min-h-full overflow-auto"
			:style="{
				width: `${builderStore.builderLayout.leftPanelWidth}px`,
			}">
			<template v-for="tab of panelTabs" :key="tab.name">
				<div
					v-if="tab.component && mountedTabs.has(tab.name)"
					v-show="builderStore.leftPanelActiveTab === tab.name"
					class="h-full">
					<component :is="tab.component" v-bind="tab.props?.()" />
				</div>
			</template>
		</div>

		<TokenManager
			v-model="builderStore.showTokenManager"
			:container="miniSidebar"
			:readonly="Boolean(editorDemo)" />
	</div>
</template>
<script setup lang="ts">
import { leftPanelTabs, type LeftPanelTab } from "@/components/LeftPanelTabs";
import TokenManager from "@/components/Modals/TokenManager.vue";
import { editorDemo } from "@/utils/editorDemo";
import useBuilderStore from "@/stores/builderStore";
import { KeyboardShortcut, Tooltip, useKeyboardShortcut } from "frappe-ui";
import { computed, reactive, Ref, ref, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import PanelResizer from "./PanelResizer.vue";

const builderStore = useBuilderStore();
const route = useRoute();

const tabs = leftPanelTabs.visible;
const panelTabs = computed(() => tabs.value.filter((tab) => tab.placement !== "drawer"));
const drawerTabs = computed(() => tabs.value.filter((tab) => tab.placement === "drawer"));

const PANEL_MIN_WIDTH = 200;
const activeTab = computed(() => tabs.value.find((tab) => tab.name === builderStore.leftPanelActiveTab));
const minWidth = computed(() => Math.max(PANEL_MIN_WIDTH, activeTab.value?.minWidth ?? 0));

// widen the stored width rather than only the drawn one: the canvas is laid out from it
watch(
	minWidth,
	(min) => {
		if (builderStore.builderLayout.leftPanelWidth < min) builderStore.builderLayout.leftPanelWidth = min;
	},
	{ immediate: true },
);

const miniSidebar = ref(null) as Ref<HTMLElement | null>;
const mountedTabs = reactive(new Set<string>());

const isActive = (tab: LeftPanelTab) => {
	const activeName =
		tab.placement === "drawer" ? builderStore.activeDrawerTab : builderStore.leftPanelActiveTab;
	return tab.isActive?.() ?? activeName === tab.name;
};

// the panel and the drawer can both be open, so an open drawer reads apart from the active panel tab
const getVariant = (tab: LeftPanelTab) => {
	if (!isActive(tab) || isHidden(tab)) return "ghost";
	return tab.placement === "drawer" ? "outline" : "subtle";
};

// a full screen drawer hides what a panel tab would show
const isHidden = (tab: LeftPanelTab) => builderStore.isDrawerFullScreen && tab.placement !== "drawer";

const select = (tab: LeftPanelTab) => {
	if (isHidden(tab)) return;
	if (tab.action) return tab.action();
	if (tab.placement === "drawer") {
		builderStore.activeDrawerTab = builderStore.activeDrawerTab === tab.name ? null : tab.name;
		return;
	}
	builderStore.leftPanelActiveTab = tab.name;
	builderStore.showTokenManager = false;
};

// read once at setup, so a tab registered later gets no binding until reload
useKeyboardShortcut(
	tabs.value
		.filter((tab) => tab.shortcut)
		.map((tab) => ({
			combo: tab.shortcut!,
			description: `Show ${tab.label} Panel`,
			group: "View",
			handler: () => select(tab),
		})),
);

// a non-lazy tab mounts as soon as it registers, a lazy one on first open
watchEffect(() => {
	panelTabs.value.forEach((tab) => {
		if (!tab.component) return;
		if (!tab.lazy || builderStore.leftPanelActiveTab === tab.name || tab.preload?.()) {
			mountedTabs.add(tab.name);
		}
	});
});

watch(
	() => route.fullPath,
	() => {
		builderStore.showTokenManager = false;
	},
);
</script>
