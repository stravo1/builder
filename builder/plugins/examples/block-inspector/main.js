export default {
	run(ctx) {
		function inspect() {
			var selected = ctx.builder.getSelectedBlocks();
			var root = ctx.builder.getRootBlock();
			var viewport = ctx.builder.getViewport();

			ctx.builder.ui.postMessage({
				type: "inspection-result",
				selectedCount: selected.length,
				selected: selected,
				rootId: root ? root.id : null,
				childCount: root ? root.children.length : 0,
				viewport: viewport,
			});
		}

		inspect();

		ctx.builder.on("selectionChange", function () {
			inspect();
		});

		ctx.builder.on("blockHover", function (data) {
			ctx.builder.ui.postMessage({
				type: "hover-update",
				blockId: data.blockId,
			});
		});
	},
};
