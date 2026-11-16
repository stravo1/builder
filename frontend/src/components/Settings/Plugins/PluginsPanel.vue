<template>
	<div class="flex gap-6">
		<PluginList
			class="w-72 shrink-0"
			:selected="selectedPlugin"
			@select="(plugin) => (selectedPlugin = plugin)" />
		<div class="min-w-0 flex-1 border-l border-outline-gray-1 pl-6">
			<PluginDetails
				v-if="selectedPlugin"
				:key="selectedPlugin"
				:plugin="selectedPlugin"
				@close="selectedPlugin = null" />
			<p v-else class="pt-2 text-p-sm text-ink-gray-5">Pick a plugin to see what it does and manage it.</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import PluginDetails from "@/components/Settings/Plugins/PluginDetails.vue";
import PluginList from "@/components/Settings/Plugins/PluginList.vue";
import { installations, reloadInstallations } from "@/data/plugins";
import { useIntervalFn } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";

/**
 * The list on the left, and the details of the plugin picked in it on the right.
 * The panel owns only the choice of which one is open.
 */
const selectedPlugin = ref<string | null>(null);

/** A crashed install job sends no event. So the list asks again while a row is installing. */
const isInstalling = computed(() => installations.value.some((row) => row.install_state === "Installing"));
const installPoll = useIntervalFn(reloadInstallations, 5000, { immediate: false });
watch(isInstalling, (installing) => (installing ? installPoll.resume() : installPoll.pause()), {
	immediate: true,
});

onMounted(reloadInstallations);
</script>
