var LOREM =
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function generateSentences(count) {
	var sentences = LOREM.split(". ");
	var result = [];
	for (var i = 0; i < count; i++) {
		result.push(sentences[i % sentences.length] + (i < count - 1 ? ". " : "."));
	}
	return result.join(" ");
}

function generateWords(count) {
	var words = LOREM.split(" ");
	var result = [];
	for (var i = 0; i < count; i++) {
		result.push(words[i % words.length]);
	}
	return result.join(" ");
}

export default {
	run(ctx) {
		function getParent() {
			var selected = ctx.builder.getSelectedBlocks();
			if (selected.length === 1) return selected[0];
			return ctx.builder.getRootBlock();
		}

		ctx.builder.ui.onMessage(function (msg) {
			var parent = getParent();
			if (!parent) {
				ctx.builder.ui.postMessage({ type: "result", message: "No target available.", success: false });
				return;
			}

			if (msg.action === "add-heading") {
				var text = generateWords(msg.wordCount || 5);
				var block = ctx.builder.createBlock({
					template: "text",
					element: "h2",
					parentId: parent.id,
					innerHTML: text,
				});
				ctx.builder.selectBlocks([block.id]);
				ctx.builder.ui.postMessage({ type: "result", message: "Heading added.", success: true });
			}

			if (msg.action === "add-paragraphs") {
				var count = msg.count || 1;
				var created = [];
				var batchId = ctx.builder.history.beginBatch();
				for (var i = 0; i < count; i++) {
					var text = generateSentences(msg.sentenceCount || 3);
					var block = ctx.builder.createBlock({
						template: "text",
						parentId: parent.id,
						innerHTML: text,
					});
					created.push(block.id);
				}
				ctx.builder.history.endBatch(batchId);
				if (created.length) ctx.builder.selectBlocks(created);
				ctx.builder.ui.postMessage({ type: "result", message: count + " text block(s) added.", success: true });
			}
		});

		ctx.builder.ui.postMessage({ type: "ready" });
	},
};
