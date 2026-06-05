<template>
	<span v-if="svg" v-html="svg" class="inline-flex shrink-0 text-inherit" :style="svgStyle" />
	<span v-else class="lucide-puzzle h-4 w-4 shrink-0 text-inherit" />
</template>

<script setup lang="ts">
import { normalizePluginIcon } from "@/stores/pluginStore";
import { onMounted, ref } from "vue";

const props = defineProps<{
	name: string;
}>();

const svgStyle = {
	width: "16px",
	height: "16px",
};

const svg = ref<string | null>(null);

onMounted(async () => {
	const raw = normalizePluginIcon(props.name);
	const clean = raw.replace("lucide-", "");
	const key = toPascalCase(clean);
	try {
		const mod = (await import("lucide-static")) as Record<string, string>;
		const content = mod[key];
		if (content) {
			svg.value = content.replace(
				/<svg([^>]*)>/,
				'<svg$1 style="display:block;width:100%;height:100%">',
			);
		}
	} catch {
		svg.value = null;
	}
});

function toPascalCase(kebab: string): string {
	return kebab
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join("");
}
</script>
