#!/usr/bin/env node

import { packageExtension } from "../package.js";

const usage = `Usage: builder-extension package [root] [options]

Options:
  --dist <directory>    Built files relative to root (default: dist)
  --output <directory>  Package output relative to root (default: release)
  --tag <version>       Require this release tag to match the manifest
  --help                Show this help`;

const readArguments = (arguments_) => {
	if (arguments_[0] !== "package") throw new Error(usage);
	const options = {};
	for (let index = 1; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--help") return { help: true };
		if (!argument.startsWith("--") && !options.root) options.root = argument;
		else {
			const field = { "--dist": "dist", "--output": "output", "--tag": "tag" }[argument];
			if (!field || !arguments_[index + 1])
				throw new Error(`Unknown or incomplete option "${argument}"\n\n${usage}`);
			options[field] = arguments_[index + 1];
			index += 1;
		}
	}
	return options;
};

try {
	const options = readArguments(process.argv.slice(2));
	if (options.help) console.log(usage);
	else {
		const packaged = packageExtension(options);
		console.log(`Created ${packaged.path}`);
		console.log(`SHA-256 ${packaged.sha256}`);
		console.log(`Size ${packaged.size} bytes`);
	}
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
