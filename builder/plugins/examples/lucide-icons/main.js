export default {
	run(ctx) {
		function getParent() {
			var selected = ctx.builder.getSelectedBlocks();
			if (selected.length === 1) return selected[0];
			return ctx.builder.getRootBlock();
		}

		function scaleSvg(svg, sizePx) {
			var size = Math.min(128, Math.max(8, sizePx || 24));
			return svg.replace(/<svg\b([^>]*)>/i, function (_match, attrs) {
				var cleaned = attrs
					.replace(/\s(width|height)="[^"]*"/gi, "")
					.replace(/\sstyle="[^"]*"/gi, "");
				return (
					'<svg' +
					cleaned +
					' width="' +
					size +
					'" height="' +
					size +
					'" style="display:block;width:100%;height:100%">'
				);
			});
		}

		ctx.builder.ui.onMessage(function (msg) {
			if (msg.action !== "insert-icon") return;

			var parent = getParent();
			if (!parent) {
				ctx.builder.ui.postMessage({ type: "result", message: "No target available.", success: false });
				return;
			}

			var size = Math.min(128, Math.max(8, parseInt(msg.size, 10) || 24));
			var sizedSvg = scaleSvg(msg.svg, size);

			var block = ctx.builder.createBlock({
				template: "html",
				parentId: parent.id,
				innerHTML: sizedSvg,
				styles: {
					base: {
						width: size + "px",
						height: size + "px",
					},
				},
			});

			ctx.builder.selectBlocks([block.id]);
			ctx.builder.ui.postMessage({
				type: "result",
				message: msg.name + " icon added (" + size + "px).",
				success: true,
			});
		});

		ctx.builder.ui.postMessage({ type: "ready" });
	},
};
