export default {
	run(ctx) {
		ctx.builder.ui.onMessage(function (msg) {
			console.log(99, msg)
			if (msg.action !== "apply-color") return;

			var selected = ctx.builder.getSelectedBlocks();
			if (!selected.length) {
				ctx.builder.ui.postMessage({
					type: "result",
					updated: 0,
					message: "Select at least one block first.",
				});
				return;
			}

			var batchId = ctx.builder.history.beginBatch();
			var updated = 0;

			for (var i = 0; i < selected.length; i++) {
				var patch = {};
				if (msg.property === "background") {
					patch.background = msg.value;
				} else {
					patch.backgroundColor = msg.value;
					patch.backgroundImage = "none";
				}
				ctx.builder.updateBlock(selected[i].id, { styles: { base: patch } });
				updated++;
			}

			ctx.builder.history.endBatch(batchId);
			ctx.builder.ui.postMessage({
				type: "result",
				updated: updated,
				message: "Applied to " + updated + " block(s).",
			});
		});

		ctx.builder.ui.postMessage({ type: "ready" });
	},
};
