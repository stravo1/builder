<template>
	<div class="flex w-full items-center gap-2">
		<Button
			v-if="canOpen"
			variant="solid"
			size="sm"
			icon-left="lucide-panel-right"
			label="Open"
			@click="emit('open')" />
		<!-- a disabled extension has no frame to open, so turning it back on is the one thing left to do -->
		<Button
			v-else-if="!enabled"
			variant="solid"
			size="sm"
			icon-left="lucide-power"
			label="Enable"
			:loading="working"
			@click="emit('setEnabled', true)" />
		<Button
			v-if="canUpdate"
			variant="subtle"
			size="sm"
			icon-left="lucide-download"
			label="Update"
			:loading="updating"
			:disabled="working"
			@click="emit('update')" />

		<div class="ml-auto">
			<Dropdown :options="moreActions" placement="right">
				<template #trigger="{ open }">
					<Button
						variant="ghost"
						size="sm"
						icon="lucide-more-horizontal"
						:active="open"
						:disabled="working"
						aria-label="More actions" />
				</template>
			</Dropdown>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button, Dropdown, type DropdownOptions } from "frappe-ui";
import { computed } from "vue";

const props = defineProps<{
	canOpen: boolean;
	enabled: boolean;
	working: boolean;
	canUpdate: boolean;
	updating: boolean;
}>();

const emit = defineEmits<{
	open: [];
	setEnabled: [enabled: boolean];
	uninstall: [];
	update: [];
}>();

const moreActions = computed<DropdownOptions>(() => [
	...(props.enabled
		? [{ label: "Disable", icon: "lucide-power-off", onClick: () => emit("setEnabled", false) }]
		: []),
	{ label: "Uninstall", icon: "lucide-trash-2", theme: "red", onClick: () => emit("uninstall") },
]);
</script>
