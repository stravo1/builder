var counter = 0;

export default {
	run(ctx) {
		ctx.builder.ui.postMessage({ type: "hello", text: "Plugin loaded. Send me a ping!" });

		ctx.builder.ui.onMessage(function (msg) {
			if (msg.action === "ping") {
				counter++;
				var root = ctx.builder.getRootBlock();
				ctx.builder.ui.postMessage({
					type: "pong",
					count: counter,
					blockCount: root ? root.children.length : 0,
					echo: msg.text || "",
				});
			}
		});
	},
};
