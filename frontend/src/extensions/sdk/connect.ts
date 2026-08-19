/**
 * The frame side of the handshake.
 *
 * Builder posts one message on the window with a port beside it. Everything
 * after that runs on the port, so this listener matters exactly once.
 */

import { createPortChannel, type PortChannel } from "../transport/createPortChannel";
import { PROTOCOL_VERSION, type ConnectMessage } from "../types";
import { runAction } from "./actions";
import { runSlot, setActiveSlot } from "./slots";

/**
 * The origin check lives here, not in the host: measured, every extension frame
 * reports `origin: "null"`, so a host-side allowlist separates nothing (1.12).
 *
 * Builder serves this file, so its own URL names the host origin — and names the
 * hostname Builder is actually being used on, which a value baked in at render
 * time can get wrong.
 */
const HOST_ORIGIN = new URL(import.meta.url).origin;

let channel: PortChannel | null = null;
let slotProps: Record<string, unknown> = {};

export const getChannel = (): PortChannel => {
	if (!channel) throw new Error("The Builder SDK is not connected yet");
	return channel;
};

export const getSlotProps = () => slotProps;

const isConnectMessage = (data: unknown): data is ConnectMessage =>
	typeof data === "object" &&
	data !== null &&
	(data as ConnectMessage).type === "connect" &&
	(data as ConnectMessage).v === PROTOCOL_VERSION;

const applyTheme = (theme: unknown) => document.documentElement.setAttribute("data-theme", String(theme));

const start = async (message: ConnectMessage, port: MessagePort) => {
	channel = createPortChannel(port);
	channel.listen("theme", applyTheme);
	// the one call the host makes into this frame (B2), registered before any
	// extension code runs, so a click cannot arrive at nothing
	channel.handle("action.invoke", runAction);
	applyTheme(message.theme);
	slotProps = message.props ?? {};
	setActiveSlot(message.slot);

	// the shell names no extension, so the entry to import arrives here (D5)
	await import(/* @vite-ignore */ message.entry);
	// the props travel to the document the slot mounts, so a dialog can be opened
	// with call-time arguments (1.15)
	await runSlot(slotProps);
};

/**
 * Registered when this module loads. A module script runs before the iframe's
 * own `load` event, which is what the host waits for, so the message cannot
 * arrive before this listener exists.
 */
export const listenForHandshake = () => {
	window.addEventListener("message", (message: MessageEvent) => {
		if (message.origin !== HOST_ORIGIN) return;
		if (channel) return; // the port transfers once, so the handshake happens once
		if (!isConnectMessage(message.data) || !message.ports[0]) return;
		void start(message.data, message.ports[0]);
	});
};
