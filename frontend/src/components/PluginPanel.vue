<template>
	<DraggablePopup
		:modelValue="pluginStore.panelOpen"
		@update:modelValue="(val) => { if (!val) closePlugin() }"
		:width="340"
		:height="480"
		:resizable="true"
		:minWidth="240"
		:minHeight="200"
		placement="center">
		<template #header>
			<div class="flex items-center gap-2 overflow-hidden">
				<span v-if="pluginStore.activePlugin" class="shrink-0 text-ink-gray-5">
					<PluginIcon :plugin="pluginStore.activePlugin" size="sm" />
				</span>
				<span class="truncate text-xs font-medium text-ink-gray-8">
					{{ pluginStore.activePlugin?.name || "Plugin" }}
				</span>
				<span v-if="pluginStore.loading" class="text-xs text-ink-gray-5">Running...</span>
			</div>
		</template>
		<template #content>
			<div
				v-if="pluginStore.error"
				class="-mx-3 -mt-3 mb-2 shrink-0 border-b border-outline-red-1 bg-surface-red-1 px-3 py-1.5 text-xs text-ink-red-3">
				{{ pluginStore.error }}
			</div>
			<iframe
				ref="iframeRef"
				class="min-h-0 w-full flex-1 border-0 bg-surface-white"
				style="height: 100%"
				:sandbox="sandboxAttrs"
				title="Plugin UI" />
		</template>
	</DraggablePopup>
</template>

<script setup lang="ts">
import DraggablePopup from "@/components/Controls/DraggablePopup.vue";
import PluginIcon from "@/components/PluginIcon.vue";
import usePluginStore from "@/stores/pluginStore";
import useBuilderStore from "@/stores/builderStore";
import { uiMessageBridge } from "@/plugins/bridge/UIMessageBridge";
import {
	applyPluginThemeToIframe,
	wrapPluginDocument,
} from "@/plugins/ui/pluginUiStyles";
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from "vue";

defineProps<{
	allowedDomains?: string[];
}>();

const pluginStore = usePluginStore();
const builderStore = useBuilderStore();
const iframeRef = ref<HTMLIFrameElement | null>(null);

const sandboxAttrs = computed(() => "allow-scripts allow-forms allow-same-origin");

function applyHtml() {
	const html = pluginStore.uiHtml;
	if (iframeRef.value && html) {
		iframeRef.value.srcdoc = wrapPluginDocument(html, builderStore.isDark);
	}
}

watch(
	() => builderStore.isDark,
	(isDark) => {
		applyPluginThemeToIframe(iframeRef.value, isDark);
	},
);

watch(() => pluginStore.uiHtml, async () => {
	await nextTick();
	applyHtml();
});

watch(iframeRef, (iframe, _, onCleanup) => {
	uiMessageBridge.setIframe(iframe);
	applyHtml();
	if (iframe) {
		const onLoad = () => applyPluginThemeToIframe(iframe, builderStore.isDark);
		iframe.addEventListener("load", onLoad);
		onCleanup(() => iframe.removeEventListener("load", onLoad));
	}
});

onMounted(() => {
	uiMessageBridge.attach();
});

onUnmounted(() => {
	uiMessageBridge.detach();
	uiMessageBridge.setIframe(null);
});

function closePlugin() {
	pluginStore.closePlugin();
}
</script>
