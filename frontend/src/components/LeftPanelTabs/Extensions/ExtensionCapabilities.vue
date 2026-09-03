<template>
	<div class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-1">
		<section v-for="group in groups" :key="group.name" class="divide-y divide-outline-gray-1">
			<header class="bg-surface-gray-1 px-3 py-2">
				<p class="text-xs font-medium" :class="group.sensitive ? 'text-ink-red-6' : 'text-ink-gray-8'">
					{{ group.name }}
				</p>
				<p class="pt-0.5 text-xs text-ink-gray-5">{{ group.summary }}</p>
			</header>

			<div class="divide-y divide-outline-gray-1 px-3">
				<div v-for="capability in group.capabilities" :key="capability" class="py-3">
					<Switch
						size="sm"
						:disabled="readOnly"
						:description="capabilityDetails[capability].warning"
						:model-value="granted.includes(capability)"
						@update:model-value="(allow: boolean) => answer(capability, allow)">
						<template #label>
							<span class="text-xs">{{ capabilityDetails[capability].label }}</span>
						</template>
					</Switch>
				</div>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { setGrantedCapabilities } from "@/data/extensions";
import { capabilityDetails, groupCapabilities, isSensitive } from "@/extensions/capabilityClasses";
import { confirm } from "@/utils/helpers";
import type { Capability } from "frappe-builder-extension-sdk/types";
import { Switch, toast } from "frappe-ui";
import { computed } from "vue";

const props = defineProps<{
	extension: string;
	label: string;
	requested: Capability[];
	granted: Capability[];
	readOnly?: boolean;
}>();

const emit = defineEmits<{ granted: [capabilities: Capability[]] }>();

/** Only what this extension asked for. A capability it never asked for is not a choice. */
const groups = computed(() => groupCapabilities(props.requested));

/**
 * Turning one off asks nothing: a narrower grant can break the extension and
 * nothing else. Turning one back on can reach every published page, so that
 * direction carries the warning.
 */
const answer = async (capability: Capability, allow: boolean) => {
	if (props.readOnly) return;
	if (allow && isSensitive(capability) && !(await confirmSensitive(capability))) return;

	const next = allow
		? [...props.granted, capability]
		: props.granted.filter((granted) => granted !== capability);

	try {
		emit("granted", await setGrantedCapabilities(props.extension, next));
	} catch (thrown) {
		toast.error((thrown as Error).message);
	}
};

const confirmSensitive = (capability: Capability) =>
	confirm(
		`${capabilityDetails[capability].warning} Allow ${props.label} to ${capabilityDetails[
			capability
		].label.toLowerCase()}?`,
		"This reaches the whole site",
	);
</script>
