<template>
	<ExtensionDetails
		v-if="selectedExtension"
		:extension="selectedExtension.name"
		:is-installed="selectedExtension.isInstalled"
		@back="selectedExtension = null" />
	<ExtensionList v-else @select="(selection) => (selectedExtension = selection)" />
</template>

<script setup lang="ts">
import ExtensionDetails from "@/components/LeftPanelTabs/Extensions/ExtensionDetails.vue";
import ExtensionList from "@/components/LeftPanelTabs/Extensions/ExtensionList.vue";
import { loadUserInstallations, type SelectedExtension } from "@/data/extensions";
import { onMounted, ref } from "vue";

/**
 * The list and one extension's details are the same panel, one at a time, the way
 * VS Code opens an extension page from its list. The tab owns which one is open
 * and nothing else.
 */
const selectedExtension = ref<SelectedExtension | null>(null);

onMounted(loadUserInstallations);
</script>
