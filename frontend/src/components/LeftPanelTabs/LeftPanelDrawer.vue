<template>
	<!-- v-show and KeepAlive: closing the drawer or switching its tab keeps each tab's state.
	     The rail shows through at the left, so it can switch away from the drawer -->
	<div v-show="activeTab" class="pointer-events-none flex flex-col">
		<!-- in the toolbar's place, and keeps the main menu -->
		<div
			class="pointer-events-auto flex h-[var(--toolbar-height)] shrink-0 items-center gap-4 border-b border-outline-gray-1 bg-surface-base px-3">
			<MainMenu />
			<div :id="headerId" class="flex min-w-0 flex-1 items-center self-stretch">
				<span v-if="!hasCustomHeader" class="text-sm font-medium text-ink-gray-9">
					{{ activeTab?.label }}
				</span>
			</div>
			<Button
				variant="ghost"
				icon="lucide-x"
				:aria-label="__('Close')"
				@click="builderStore.activeDrawerTab = null" />
		</div>
		<div
			class="pointer-events-auto min-h-0 flex-1 overflow-auto bg-surface-base"
			:style="{ marginLeft: `${railWidth}px` }">
			<KeepAlive>
				<component
					:is="activeTab.component"
					v-if="activeTab"
					:key="activeTab.name"
					v-bind="activeTab.props?.()" />
			</KeepAlive>
		</div>
	</div>
</template>
<script setup lang="ts">
import { drawerKey, leftPanelTabs } from "@/components/LeftPanelTabs";
import MainMenu from "@/components/MainMenu.vue";
import useBuilderStore from "@/stores/builderStore";
import { __ } from "@/translation";
import { computed, provide, ref } from "vue";

const builderStore = useBuilderStore();

const headerId = "left-panel-drawer-header";
const hasCustomHeader = ref(false);
provide(drawerKey, { headerId, hasCustomHeader });

const railWidth = computed(() =>
	builderStore.showLeftPanel ? builderStore.builderLayout.optionsPanelWidth : 0,
);
const activeTab = computed(() =>
	leftPanelTabs.visible.value.find(
		(tab) => tab.placement === "drawer" && tab.name === builderStore.activeDrawerTab,
	),
);
</script>
