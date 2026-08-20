<template>
	<!--
		The consent prompt, drawn by Builder and never by the extension (1.7). An
		extension frame cannot paint here, cannot read this, and cannot answer it.

		One instance for the whole editor: `grants.ts` queues requests so only one
		question stands at a time.
	-->
	<Dialog v-if="prompt" :modelValue="true" size="sm" @update:modelValue="deny">
		<template #body>
			<div class="bg-surface-modal p-5">
				<h3 class="text-lg-semibold text-ink-gray-9">{{ prompt.extension.label }} wants access</h3>

				<!-- the period is part of the interpolation, not a node beside it: a
					newline between a closing tag and a bare "." becomes a text node, and
					the sentence reads "Contact ." Prettier reflows the markup, so the
					punctuation cannot live in the whitespace -->
				<p class="pt-4 text-p-sm text-ink-gray-6">
					It is asking to
					<span class="font-semibold text-ink-gray-8">{{ verbs }}</span>
					records of
					<span class="font-semibold text-ink-gray-8">{{ subject }}</span>
				</p>

				<p class="pt-2 text-p-sm text-ink-gray-5">
					It can only do what you can do. Your own permissions still apply to every record.
				</p>

				<div v-if="prompt.sensitive" class="mt-4 rounded bg-surface-red-1 p-3">
					<p class="text-p-sm text-ink-red-6">
						{{ prompt.doctype }} controls how this site works. Access to it can change what other extensions
						and other people are allowed to do.
					</p>
					<label class="flex cursor-pointer items-start gap-2 pt-3 text-p-sm text-ink-red-6">
						<input v-model="understood" type="checkbox" class="mt-0.5" />
						<span>I understand, and I trust {{ prompt.extension.label }} with this.</span>
					</label>
				</div>

				<div class="flex justify-end gap-2 pt-4">
					<Button variant="subtle" @click="deny">Deny</Button>
					<Button variant="solid" :disabled="!canAllow" @click="allow">Allow</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import { answerPrompt, pendingPrompt } from "@/extensions/data/grants";
import { Button } from "frappe-ui";
import { computed, ref, watch } from "vue";

const prompt = computed(() => pendingPrompt.value);
const understood = ref(false);

// each question is answered on its own. Carrying the tick over would let one
// consent stand for a doctype the user never saw
watch(prompt, () => (understood.value = false));

const canAllow = computed(() => !prompt.value?.sensitive || understood.value);

/** The doctype and the full stop, so no reflow can put whitespace between them. */
const subject = computed(() => `${prompt.value?.doctype}.`);

/** "read", "read and write", "read, write and delete". */
const verbs = computed(() => {
	const asked = prompt.value?.access ?? [];
	if (asked.length < 2) return asked.join("");
	return `${asked.slice(0, -1).join(", ")} and ${asked[asked.length - 1]}`;
});

const allow = () => answerPrompt(true);

/**
 * The button, Escape and a click outside all mean the same thing. An unanswered
 * question is a no, which is what every browser permission prompt does.
 */
const deny = () => answerPrompt(false);
</script>
