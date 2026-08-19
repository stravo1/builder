<template>
	<!--
		The host owns the chrome here too, so every extension popover looks the
		same (1.15). Unlike the dialog it is not modal: there is no backdrop, the
		editor stays live behind it, and the user drags it out of their way.

		`DraggablePopup` is what Builder's own token manager floats in, so the
		drag, the clamping and the close button all come from there.
	-->
	<DraggablePopup
		v-if="popover"
		:modelValue="true"
		:width="WIDTH"
		:height="FRAME_HEIGHT"
		placement="top-right"
		:container="body"
		:placementOffsetLeft="24"
		:placementOffsetTop="96"
		@update:modelValue="dismiss"
		@dragging="(value: boolean) => (dragging = value)">
		<template #header>
			<span class="truncate font-medium">{{ popover.title }}</span>
		</template>
		<template #content>
			<!-- an iframe swallows the pointer, so it stops taking events mid-drag -->
			<div :class="dragging && 'pointer-events-none'" :style="{ height: `${FRAME_HEIGHT}px` }">
				<ExtensionFrame
					:extension="extension.name"
					:entry="extension.entry"
					slot="popover"
					:initialProps="popover.props"
					:dispatch="dispatch"
					@connect="(channel) => connectExtension(extension.name, channel)"
					@disconnect="(channel) => disconnectExtension(extension.name, channel)" />
			</div>
		</template>
	</DraggablePopup>
</template>

<script setup lang="ts">
import DraggablePopup from "@/components/Controls/DraggablePopup.vue";
import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { connectExtension, disconnectExtension, dispatcherFor } from "@/extensions";
import { dismissPopover, openPopovers } from "@/extensions/editor/uiMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { computed, ref } from "vue";

const WIDTH = 320;
const FRAME_HEIGHT = 320;

const props = defineProps<{ extension: InstalledExtension }>();

const popover = computed(() => openPopovers.get(props.extension.name));
const dispatch = computed(() => dispatcherFor(props.extension));
const dragging = ref(false);

/** Opens clear of the toolbar, at the top right. The user moves it from there. */
const body = document.body;

/** The close button ends the pending `openPopover` with nothing, as a dismiss does. */
const dismiss = () => dismissPopover(props.extension.name);
</script>
