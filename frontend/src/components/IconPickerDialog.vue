<template>
	<Dialog :modelValue="open" :title="title" size="md" @update:modelValue="emit('update:open', $event)">
		<div class="flex gap-2">
			<TextInput v-model="query" class="flex-1" type="search" :placeholder="__('Search icons')" autofocus />
			<Button v-if="modelValue" :label="__('Use Default')" @click="pick('')" />
		</div>
		<div class="mt-3 grid grid-cols-10 gap-1">
			<Button
				v-for="name in matches"
				:key="name"
				:variant="`lucide-${name}` === modelValue ? 'subtle' : 'ghost'"
				:icon="lucideIcon(`lucide-${name}`)"
				:tooltip="name"
				:aria-label="name"
				@click="pick(`lucide-${name}`)" />
		</div>
		<p v-if="!matches.length" class="py-6 text-center text-p-sm text-ink-gray-5">
			{{ __("No icons match") }}
		</p>
	</Dialog>
</template>

<script setup lang="ts">
import { lucideIcon } from "@/plugins/lucideIcon";
import { __ } from "@/translation";
import { Button, Dialog, TextInput } from "frappe-ui";
import { computed, ref, shallowRef } from "vue";

/** Any lucide icon, by name and tags. Each shown icon downloads when drawn, so a search shows a few at a time. */
defineProps<{ open: boolean; title: string; modelValue?: string }>();
const emit = defineEmits<{ "update:open": [open: boolean]; "update:modelValue": [icon: string] }>();

const SHOWN = 60;
const query = ref("");
// every name with its search tags, in its own chunk, so the editor loads it only for a picker
const tags = shallowRef<Record<string, string[]>>({});
import("lucide-static/tags.json").then((module) => (tags.value = module.default));

// icons named for the words first, then those only tagged with them
const matches = computed(() => {
	const words = query.value.trim().toLowerCase();
	const entries = Object.entries(tags.value);
	const named = entries.filter(([name]) => name.includes(words));
	const tagged = entries.filter(
		([name, nameTags]) => !name.includes(words) && nameTags.some((tag) => tag.includes(words)),
	);
	return [...named, ...tagged].slice(0, SHOWN).map(([name]) => name);
});

const pick = (icon: string) => {
	emit("update:modelValue", icon);
	emit("update:open", false);
};
</script>
