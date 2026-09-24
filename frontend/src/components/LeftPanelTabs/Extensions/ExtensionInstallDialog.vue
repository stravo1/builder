<template>
	<!-- Collects the capabilities granted at install, and nothing else. -->
	<Dialog
		:modelValue="open"
		size="sm"
		bare
		@update:modelValue="(value: boolean) => emit('update:open', value)">
		<template #default>
			<div class="bg-surface-modal p-5">
				<DialogTitle as="h3" class="text-md-semibold text-ink-gray-9">Install {{ label }}?</DialogTitle>
				<DialogDescription as="p" class="pt-2 text-p-sm text-ink-gray-6">
					<template v-if="requested.length">
						It is asking for the following permissions. You can change this later.
					</template>
					<template v-else>It needs no permissions.</template>
				</DialogDescription>

				<div v-if="requested.length" class="pt-4">
					<ExtensionCapabilities
						:extension="extension"
						:label="label"
						:requested="requested"
						:doctype-grants="[]"
						v-model:granted="granted" />
				</div>

				<div class="flex justify-end gap-2 pt-4">
					<Button variant="subtle" label="Cancel" @click="emit('update:open', false)" />
					<Button variant="solid" label="Install" @click="emit('install', granted)" />
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import ExtensionCapabilities from "@/components/LeftPanelTabs/Extensions/ExtensionCapabilities.vue";
import type { Capability } from "frappe-builder-extension-sdk/types";
import { Button } from "frappe-ui";
import { ref, watch } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";

const props = defineProps<{
	open: boolean;
	extension: string;
	label: string;
	requested: Capability[];
}>();

const emit = defineEmits<{
	"update:open": [open: boolean];
	install: [capabilities: Capability[]];
}>();

const granted = ref<Capability[]>([]);

// every capability starts on each time the dialog opens, so a choice from an
// earlier attempt does not carry over
watch(
	() => props.open,
	(open) => open && (granted.value = [...props.requested]),
	{ immediate: true },
);
</script>
