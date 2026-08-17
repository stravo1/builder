<template>
	<!-- no allow-same-origin: the opaque origin is the whole isolation guarantee (1.7) -->
	<iframe
		ref="frame"
		:src="SHELL_URL"
		class="h-full w-full border-0"
		sandbox="allow-scripts allow-forms"
		@load="connect" />
</template>

<script setup lang="ts">
import { createPortChannel, type Dispatcher, type PortChannel } from "@/extensions/transport/createPortChannel";
import { PROTOCOL_VERSION, type ConnectMessage, type ExtensionSlot } from "@/extensions/types";
import useBuilderStore from "@/stores/builderStore";
import { onBeforeUnmount, ref, watch } from "vue";

/** One document serves every extension and every slot, so it takes no segment (D5). */
const SHELL_URL = "/builder_extension";

const props = defineProps<{
	extension: string;
	slot: ExtensionSlot;
	entry: string;
	initialProps?: Record<string, unknown>;
	/** Answers what the frame calls. Named as B2 names it, and not `onRequest`,
	 * which Vue would read as a listener for a `request` event. */
	dispatch?: Dispatcher;
}>();

/**
 * The channel, not the port: `createPortChannel` owns `port.onmessage`, so one
 * port can back only one channel, and this component needs it for theme events.
 */
const emit = defineEmits<{
	connect: [channel: PortChannel];
	disconnect: [];
}>();

const store = useBuilderStore();
const frame = ref<HTMLIFrameElement | null>(null);
let channel: PortChannel | null = null;

const theme = () => (store.isDark ? "dark" : "light");

const handshake = (): ConnectMessage => ({
	v: PROTOCOL_VERSION,
	type: "connect",
	slot: props.slot,
	entry: props.entry,
	theme: theme(),
	props: props.initialProps,
});

const disconnect = () => {
	if (!channel) return;
	channel.close();
	channel = null;
	emit("disconnect");
};

/**
 * Runs on every `load`, so a reloaded frame reconnects. The old channel closes
 * first, which rejects any call left pending against a document that is gone.
 */
const connect = () => {
	disconnect();
	const pair = new MessageChannel();
	channel = createPortChannel(pair.port1, props.dispatch);
	// "*" is the only target that reaches an opaque origin. The port makes the
	// broadcast safe: it is transferred once, and this is the last window message
	frame.value?.contentWindow?.postMessage(handshake(), "*", [pair.port2]);
	emit("connect", channel);
};

// the handshake carries the theme once, so a later flip needs its own message
watch(
	() => store.isDark,
	() => channel?.emit("theme", theme()),
);

onBeforeUnmount(disconnect);
</script>
