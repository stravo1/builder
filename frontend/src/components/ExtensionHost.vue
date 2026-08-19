<template>
	<!--
		The hidden entry frame of every installed extension (D9). It runs main.js
		and paints nothing, so it is display:none. An extension's visible frames
		are mounted by the surfaces that own them, never here.
	-->
	<div>
		<div class="hidden" aria-hidden="true">
			<ExtensionFrame
				v-for="extension in installedExtensions"
				:key="frameKey(extension)"
				:extension="extension.name"
				:entry="extension.entry"
				slot="main"
				:dispatch="dispatcherFor(extension)"
				@connect="(channel) => connectExtension(extension.name, channel)"
				@disconnect="(channel) => disconnectExtension(extension.name, channel)" />
		</div>

		<!-- editor chrome, not an extension's: it is how one is loaded at all -->
		<DevExtensionDialog />

		<!-- one per extension, each rendering nothing until ui.openDialog (1.15) -->
		<ExtensionDialog
			v-for="extension in installedExtensions"
			:key="`dialog-${frameKey(extension)}`"
			:extension="extension" />

		<!-- the same, for ui.openPopover. A popover is not modal, so both can stand -->
		<ExtensionPopover
			v-for="extension in installedExtensions"
			:key="`popover-${frameKey(extension)}`"
			:extension="extension" />
	</div>
</template>

<script setup lang="ts">
import DevExtensionDialog from "@/components/DevExtensionDialog.vue";
import ExtensionDialog from "@/components/ExtensionDialog.vue";
import ExtensionFrame from "@/components/ExtensionFrame.vue";
import ExtensionPopover from "@/components/ExtensionPopover.vue";
import { installedExtensions, loadExtensions } from "@/data/extensions";
import { connectExtension, disconnectExtension, dispatcherFor, teardownExtension } from "@/extensions";
import type { InstalledExtension } from "@/extensions/types";
import { onMounted, watch } from "vue";

onMounted(loadExtensions);

/**
 * The entry joins the key, so loading a dev version of an installed extension
 * remounts its frames. The name alone would keep the frame, which read its entry
 * once at the handshake and would go on running the installed code.
 */
const frameKey = (extension: InstalledExtension) => `${extension.name}@${extension.entry}`;

// unmounting a frame only closes its channel. What an extension registered
// outlives it, so an extension that left the list, or that is now served from
// somewhere else, is torn down by name first (B2)
watch(installedExtensions, (current, previous) => {
	previous
		?.filter((extension) => !current.some((row) => frameKey(row) === frameKey(extension)))
		.forEach((extension) => teardownExtension(extension.name));
});
</script>
