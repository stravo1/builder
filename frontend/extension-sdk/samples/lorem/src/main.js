/**
 * Fills a text block with placeholder copy.
 *
 * One context menu row. `showWhen` keeps it out of the menu for anything but a
 * single text block, so the host never offers a row that would do nothing.
 */

import builder from "frappe-builder-extension-sdk";

const SENTENCES = [
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
	"Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
	"Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
];

builder.actions.register("lorem.fill", async ({ blockId }) => {
	const block = await builder.block.get(blockId);
	// one sentence for a heading, the whole paragraph for anything else
	const copy = /^h[1-6]$/.test(block.element) ? SENTENCES[0] : SENTENCES.join(" ");

	await builder.block.update(blockId, { innerHTML: copy });
});

builder.contextMenu.register({
	name: "fill",
	label: "Fill with placeholder text",
	action: "lorem.fill",
	showWhen: { isText: true, count: 1 },
});
