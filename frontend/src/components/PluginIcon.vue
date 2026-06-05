<template>
	<img
		v-if="iconUrl"
		:src="iconUrl"
		:alt="alt"
		class="shrink-0 object-contain"
		:class="sizeClass"
		loading="lazy" />
	<LucideIcon v-else :name="lucideIcon" :class="sizeClass" />
</template>

<script setup lang="ts">
import type { PluginBundle } from "@/plugins/api/types";
import { getPluginIconUrl, getPluginLucideIcon } from "@/plugins/ui/pluginIcon";
import LucideIcon from "@/components/LucideIcon.vue";
import { computed } from "vue";

const props = withDefaults(
	defineProps<{
		plugin: PluginBundle;
		alt?: string;
		size?: "sm" | "md";
	}>(),
	{
		size: "sm",
	},
);

const iconUrl = computed(() => getPluginIconUrl(props.plugin));
const lucideIcon = computed(() => getPluginLucideIcon(props.plugin));
const alt = computed(() => props.alt ?? props.plugin.name);

const sizeClass = computed(() => (props.size === "md" ? "h-5 w-5" : "h-4 w-4"));
</script>
