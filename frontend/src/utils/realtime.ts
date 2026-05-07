import { io, Socket } from "socket.io-client";
import { ref, onUnmounted } from "vue";
import { socketio_port } from "../../../../../sites/common_site_config.json";

export function useSocket() {
	const socket = ref<Socket | null>(null);

	function initSocket() {
		let url;
		let urlObject = new URL(window.location.origin);
		let port = window.location.port ? `:${socketio_port}` : "";
		urlObject.port = port;
		url = `${urlObject.toString()}${urlObject.hostname}`;

		console.log("Initializing socket with URL:", url);
		socket.value = io(url, {
			withCredentials: true,
			reconnectionAttempts: 5,
		});

		socket.value.on("connect", () => {
			console.log("Socket connected:", socket.value?.id);
		});

		socket.value.on("connect_error", (err) => {
			console.error("Socket connection error:", err);
		});

		socket.value.on("disconnect", (reason) => {
			console.warn("Socket disconnected:", reason);
		});
	}

	if (!socket.value) {
		initSocket();
	}

	onUnmounted(() => {
		if (socket.value) {
			socket.value.disconnect();
			socket.value = null;
		}
	});

	return socket;
}
