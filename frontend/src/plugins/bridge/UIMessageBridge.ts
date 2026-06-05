import type { PluginUIMessage } from "@/plugins/api/types";

// srcdoc iframes have origin "null", so we use "*" and validate via pluginId instead
const POST_ORIGIN = "*";

export class UIMessageBridge {
	private iframe: HTMLIFrameElement | null = null;
	private iframeReady = false;
	private pluginId: string | null = null;
	private onMessageFromUI: ((message: PluginUIMessage) => void) | null = null;
	private pendingMessages: Array<{ type: string; payload?: unknown }> = [];

	setIframe(iframe: HTMLIFrameElement | null) {
		this.iframe = iframe;
		this.iframeReady = false;
		if (iframe) {
			iframe.addEventListener("load", () => {
				this.iframeReady = true;
				this.flushPending();
			});
		}
	}

	setPluginId(pluginId: string | null) {
		this.pluginId = pluginId;
	}

	setHandler(handler: ((message: PluginUIMessage) => void) | null) {
		this.onMessageFromUI = handler;
	}

	postToUI(type: string, payload?: unknown) {
		if (!this.pluginId) return;
		if (!this.iframeReady || !this.iframe?.contentWindow) {
			this.pendingMessages.push({ type, payload });
			return;
		}
		this.sendToUI(type, payload);
	}

	private sendToUI(type: string, payload?: unknown) {
		if (!this.iframe?.contentWindow || !this.pluginId) return;
		const message: PluginUIMessage = {
			type,
			pluginId: this.pluginId,
			payload,
		};
		this.iframe.contentWindow.postMessage(message, POST_ORIGIN);
	}

	private flushPending() {
		const messages = [...this.pendingMessages];
		this.pendingMessages = [];
		for (const message of messages) {
			this.sendToUI(message.type, message.payload);
		}
	}

	private boundHandler = (event: MessageEvent) => {
		const data = event.data as PluginUIMessage;
		if (!data?.type || !data.pluginId || data.pluginId !== this.pluginId) return;
		this.onMessageFromUI?.(data);
	};

	attach() {
		window.addEventListener("message", this.boundHandler);
	}

	detach() {
		window.removeEventListener("message", this.boundHandler);
	}
}

export const uiMessageBridge = new UIMessageBridge();
