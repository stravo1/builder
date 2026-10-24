<template>
	<div
		v-if="activeTab"
		class="flex flex-col border-t border-outline-gray-2 bg-surface-base shadow-2xl dark:border-outline-gray-1"
		:style="{
			height: builderStore.isDrawerExpanded ? '100%' : `${builderStore.builderLayout.drawerHeight}px`,
		}">
		<PanelResizer
			v-if="!builderStore.isDrawerExpanded"
			side="top"
			:dimension="builderStore.builderLayout.drawerHeight"
			:minDimension="160"
			:maxDimension="maxHeight"
			@resize="(height) => (builderStore.builderLayout.drawerHeight = height)" />
		<div class="flex min-h-10 shrink-0 items-center gap-2 border-b border-outline-gray-1 px-3">
			<div :id="headerId" class="flex min-w-0 flex-1 items-center self-stretch">
				<span v-if="!hasCustomHeader" class="text-sm font-medium text-ink-gray-9">{{ activeTab.label }}</span>
			</div>
			<div class="flex shrink-0 gap-1">
				<Button
					variant="ghost"
					:icon="builderStore.isDrawerExpanded ? 'lucide-minimize-2' : 'lucide-maximize-2'"
					:aria-label="builderStore.isDrawerExpanded ? __('Collapse') : __('Expand')"
					@click="builderStore.isDrawerExpanded = !builderStore.isDrawerExpanded" />
				<Button
					variant="ghost"
					icon="lucide-x"
					:aria-label="__('Close')"
					@click="builderStore.activeDrawerTab = null" />
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-auto">
			<component :is="activeTab.component" :key="activeTab.name" v-bind="activeTab.props?.()" />
		</div>
	</div>
</template>
<script setup lang="ts">
import { drawerKey, leftPanelTabs } from "@/components/LeftPanelTabs";
import PanelResizer from "@/components/PanelResizer.vue";
import useBuilderStore from "@/stores/builderStore";
import { __ } from "@/translation";
import { useWindowSize } from "@vueuse/core";
import { computed, provide, ref } from "vue";

const builderStore = useBuilderStore();
const { height: windowHeight } = useWindowSize();

const headerId = "left-panel-drawer-header";
const hasCustomHeader = ref(false);
provide(drawerKey, { headerId, hasCustomHeader });

const activeTab = computed(() =>
	leftPanelTabs.visible.value.find(
		(tab) => tab.placement === "drawer" && tab.name === builderStore.activeDrawerTab,
	),
);
// leave the toolbar and a strip of the canvas in view, so the drag handle stays reachable
const maxHeight = computed(() => windowHeight.value - 120);
</script>
