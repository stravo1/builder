<template>
	<ExtensionDetails
		v-if="selectedExtension"
		:extension="selectedExtension"
		@back="selectedExtension = null" />
	<ExtensionList v-else @select="(extension) => (selectedExtension = extension)" />
</template>

<script setup lang="ts">
import ExtensionDetails from "@/components/LeftPanelTabs/Extensions/ExtensionDetails.vue";
import ExtensionList from "@/components/LeftPanelTabs/Extensions/ExtensionList.vue";
import { loadExtensions, userInstallations } from "@/data/extensions";
import useBuilderStore from "@/stores/builderStore";
import { toast } from "frappe-ui";
import { onMounted, onUnmounted, ref } from "vue";

/**
 * The list and one extension's details are the same panel, one at a time, the way
 * VS Code opens an extension page from its list. The tab owns which one is open
 * and nothing else.
 */
const selectedExtension = ref<string | null>(null);

const builderStore = useBuilderStore();

/** The event names an extension by its id. A toast names it the way the list does. */
const labelOf = (extension: string) =>
	userInstallations.value.find((row) => row.name === extension)?.label ?? extension;

/** A Hub install finishes in a background job. Reload the list when it lands. */
const onInstallDone = (event: { extension: string; state: "Ready" | "Failed" }) => {
	loadExtensions();
	if (event.state === "Failed") toast.error(`Could not install ${labelOf(event.extension)}`);
	else toast.success(`Installed ${labelOf(event.extension)}`);
};

/** An update finishes in a background job too. A failed one leaves the old version running. */
const onUpdateDone = (event: { extension: string; error?: string }) => {
	loadExtensions();
	if (event.error)
		toast.error(`Could not update ${labelOf(event.extension)}. The old version still works.`, {
			description: event.error,
		});
	else toast.success(`Updated ${labelOf(event.extension)}`);
};

onMounted(() => {
	loadExtensions();
	builderStore.realtime.on("builder_extension_install", onInstallDone);
	builderStore.realtime.on("builder_extension_update", onUpdateDone);
});

onUnmounted(() => {
	builderStore.realtime.off("builder_extension_install", onInstallDone);
	builderStore.realtime.off("builder_extension_update", onUpdateDone);
});
</script>
