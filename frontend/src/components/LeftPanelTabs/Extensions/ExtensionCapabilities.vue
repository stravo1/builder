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

				<!--
					The doctypes answered for sit under the capability they elaborate, so
					turning that capability off shows what it leaves behind.
				-->
				<div
					v-for="grant in grantsUnder(group)"
					:key="grant.document_type"
					class="flex items-center justify-between gap-2 py-3">
					<div class="min-w-0">
						<p class="truncate text-xs text-ink-gray-8">{{ grant.document_type }}</p>
						<p class="text-xs text-ink-gray-5">{{ grantSummary(grant) }}</p>
					</div>
					<Select
						size="sm"
						class="w-28 shrink-0"
						:model-value="grant.denied ? 'denied' : 'allowed'"
						:options="grantOptions(grant)"
						@update:model-value="(answer: unknown) => answerGrant(grant, answer)" />
				</div>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import {
	denyExtensionGrant,
	forgetExtensionGrant,
	setGrantedCapabilities,
	type ExtensionGrant,
} from "@/data/extensions";
import {
	capabilityDetails,
	groupCapabilities,
	isSensitive,
	SITE_DATA_CLASS,
	type CapabilityGroup,
} from "@/extensions/capabilityClasses";
import { confirm } from "@/utils/helpers";
import type { Capability } from "frappe-builder-extension-sdk/types";
import { Select, Switch, toast } from "frappe-ui";
import { computed } from "vue";

const props = defineProps<{
	extension: string;
	label: string;
	requested: Capability[];
	granted: Capability[];
	grants: ExtensionGrant[];
	readOnly?: boolean;
}>();

const emit = defineEmits<{
	granted: [capabilities: Capability[]];
	grants: [grants: ExtensionGrant[]];
}>();

/** Only what this extension asked for. A capability it never asked for is not a choice. */
const groups = computed(() =>
	groupCapabilities(props.requested, props.grants.length ? [SITE_DATA_CLASS] : []),
);

const grantsUnder = (group: CapabilityGroup) => (group.name === SITE_DATA_CLASS ? props.grants : []);

const grantSummary = (grant: ExtensionGrant) => {
	if (grant.denied) return "It stopped asking about this.";
	const allowed = ["read", "write", "delete"].filter(
		(action) => grant[`can_${action}` as keyof ExtensionGrant],
	);
	return allowed.join(", ") || "nothing";
};

/**
 * A denial records no access, so nothing stands to allow again. Forgetting is
 * the way back: the extension asks, and the answer is a fresh one.
 */
const grantOptions = (grant: ExtensionGrant) => [
	...(grant.denied ? [] : [{ label: "Allowed", value: "allowed" }]),
	{ label: "Denied", value: "denied" },
	{ label: "Ask again", value: "forgotten" },
];

/** "allowed" is the standing answer, so choosing it again writes nothing. */
const answerGrant = async (grant: ExtensionGrant, answer: unknown) => {
	if (answer !== "denied" && answer !== "forgotten") return;

	const write = answer === "denied" ? denyExtensionGrant : forgetExtensionGrant;
	try {
		emit("grants", await write(props.extension, grant.document_type));
	} catch (thrown) {
		toast.error((thrown as Error).message);
	}
};

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
