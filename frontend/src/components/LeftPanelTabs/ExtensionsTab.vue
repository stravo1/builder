<template>
	<ExtensionDetails v-if="selected" :extension="selected" @back="selected = null" />
	<ExtensionList v-else @select="(extension) => (selected = extension)" />
</template>

<script setup lang="ts">
import ExtensionDetails from "@/components/LeftPanelTabs/Extensions/ExtensionDetails.vue";
import ExtensionList from "@/components/LeftPanelTabs/Extensions/ExtensionList.vue";
import { loadUserInstallations } from "@/data/extensions";
import { onMounted, ref } from "vue";

/**
 * The list and one extension's details are the same panel, one at a time, the way
 * VS Code opens an extension page from its list. The tab owns which one is open
 * and nothing else.
 */
const selected = ref<string | null>(null);

onMounted(loadUserInstallations);
</script>
