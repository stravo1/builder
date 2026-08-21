<template>
	<div class="flex h-full flex-col gap-4 overflow-y-auto bg-surface-base p-3 text-ink-gray-8">
		<p v-if="!blockId" class="pt-2 text-p-sm italic text-ink-gray-5">Select a block to animate it.</p>

		<template v-else>
			<AnimationPreview
				:effect="settings.effect"
				:duration="settings.duration"
				:delay="settings.delay"
				:easing="settings.easing" />

			<section class="flex flex-col gap-2">
				<h3 class="text-p-xs font-medium uppercase tracking-wide text-ink-gray-5">Effect</h3>
				<EffectGrid v-model="settings.effect" />
			</section>

			<!-- every other setting only means something once an effect is chosen -->
			<template v-if="settings.effect !== 'none'">
				<section class="flex flex-col gap-2">
					<h3 class="text-p-xs font-medium uppercase tracking-wide text-ink-gray-5">Trigger</h3>
					<div class="grid grid-cols-2 gap-1.5">
						<button
							v-for="option in TRIGGERS"
							:key="option.value"
							type="button"
							:title="option.hint"
							class="rounded-md px-2 py-1.5 text-p-sm transition-colors"
							:class="
								option.value === settings.trigger
									? 'bg-surface-gray-3 text-ink-gray-9'
									: 'bg-surface-gray-1 text-ink-gray-6 hover:bg-surface-gray-2'
							"
							@click="settings.trigger = option.value">
							{{ option.label }}
						</button>
					</div>
				</section>

				<SliderRow
v-model="settings.duration" label="Duration" :min="100"
:max="2000"
:step="50" />
				<SliderRow
v-model="settings.delay" label="Delay" :min="0"
:max="1500"
:step="50" />

				<label class="flex items-center justify-between gap-2">
					<span class="text-p-sm text-ink-gray-6">Easing</span>
					<select
						v-model="settings.easing"
						class="w-32 rounded border-none bg-surface-gray-2 py-1 text-p-sm text-ink-gray-8">
						<option v-for="option in EASINGS" :key="option.value" :value="option.value">
							{{ option.label }}
						</option>
					</select>
				</label>

				<label class="flex items-center justify-between gap-2">
					<span class="text-p-sm text-ink-gray-6">Repeat</span>
					<select
						v-model="settings.repeat"
						class="w-32 rounded border-none bg-surface-gray-2 py-1 text-p-sm text-ink-gray-8">
						<option v-for="option in REPEATS" :key="option.value" :value="option.value">
							{{ option.label }}
						</option>
					</select>
				</label>

				<p class="text-p-xs text-ink-gray-5">
					Animations run on the published page, not on the canvas. The tile above is the preview.
				</p>

				<Button variant="subtle" size="sm" label="Remove animation" @click="settings.effect = 'none'" />
			</template>
		</template>
	</div>
</template>

<script setup>
/**
 * The left panel: every animation setting for the selected block, with a preview
 * the editor canvas cannot give.
 *
 * The settings object is the one owner while a block stays selected. It is
 * filled from the block when the selection moves, and written back on every
 * change. Reading the block after each write would race the editor and undo the
 * user's next keystroke.
 */
import builder from "frappe-builder-extension-sdk";
import { useBuilderContext } from "frappe-builder-extension-sdk/vue";
import { Button } from "frappe-ui";
import { computed, reactive, ref, watch } from "vue";
import { DEFAULTS, EASINGS, REPEATS, TRIGGERS, readSettings, toAttributes } from "../animation.js";
import AnimationPreview from "./AnimationPreview.vue";
import EffectGrid from "./EffectGrid.vue";
import SliderRow from "./SliderRow.vue";

const context = useBuilderContext(["selection", "readOnly"]);
const blockId = computed(() => context.selection.blockId);

const settings = reactive({ ...DEFAULTS });
/** True while the block is being read, so filling the form does not write it back. */
const loading = ref(false);

const load = async (id) => {
	loading.value = true;
	try {
		const block = id ? await builder.block.get(id) : null;
		Object.assign(settings, readSettings(block?.attributes));
	} finally {
		loading.value = false;
	}
};

watch(blockId, load, { immediate: true });

watch(
	() => ({ ...settings }),
	async (next) => {
		if (loading.value || !blockId.value || context.readOnly) return;

		await builder.block.update(blockId.value, { attributes: toAttributes(next) });
		// the entry frame owns the runtime, and knows whether this page has it
		if (next.effect !== DEFAULTS.effect) await builder.actions.run("animate.touched");
	},
);
</script>
