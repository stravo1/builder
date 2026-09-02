import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PACKAGE_BYTES, packageExtension } from "../package.js";

let roots: string[] = [];

const manifest = (values: Record<string, unknown> = {}) => ({
	v: 1,
	name: "acme/icons",
	label: "Icons",
	description: "Add and manage icons.",
	version: "1.2.0",
	entry: "main.js",
	capabilities: ["context.read"],
	...values,
});

const write = (root: string, name: string, content: string | Buffer) => {
	const file = path.join(root, name);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
};

const project = (values: Record<string, unknown> = {}) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-extension-package-"));
	roots.push(root);
	const current = manifest(values);
	write(root, "manifest.json", JSON.stringify(current));
	write(root, "README.md", "# Icons\n");
	write(root, "LICENSE", "MIT\n");
	write(root, "versions.json", JSON.stringify({ [current.version as string]: current.v }));
	write(root, "dist/manifest.json", JSON.stringify(current));
	write(root, "dist/main.js", "export {};\n");
	return root;
};

const archiveFiles = (archive: Buffer) => {
	const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	const count = archive.readUInt16LE(end + 10);
	let offset = archive.readUInt32LE(end + 16);
	const files = new Map<string, Buffer>();
	for (let index = 0; index < count; index += 1) {
		const compressedSize = archive.readUInt32LE(offset + 20);
		const nameLength = archive.readUInt16LE(offset + 28);
		const extraLength = archive.readUInt16LE(offset + 30);
		const commentLength = archive.readUInt16LE(offset + 32);
		const localOffset = archive.readUInt32LE(offset + 42);
		const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString();
		const localNameLength = archive.readUInt16LE(localOffset + 26);
		const localExtraLength = archive.readUInt16LE(localOffset + 28);
		const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
		files.set(name, inflateRawSync(archive.subarray(dataOffset, dataOffset + compressedSize)));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return files;
};

afterEach(() => {
	for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
	roots = [];
});

describe("packageExtension", () => {
	it("makes a deterministic package with files at the archive root", () => {
		const root = project({ icon: "icon.svg" });
		write(root, "dist/icon.svg", "<svg />");

		const first = packageExtension({ root, tag: "1.2.0" });
		const firstArchive = fs.readFileSync(first.path);
		const second = packageExtension({ root, tag: "1.2.0" });
		const files = archiveFiles(firstArchive);

		expect(first.filename).toBe("acme-icons-1.2.0.builderext");
		expect(second.sha256).toBe(first.sha256);
		expect([...files]).toEqual([
			["icon.svg", Buffer.from("<svg />")],
			["main.js", Buffer.from("export {};\n")],
			["manifest.json", Buffer.from(JSON.stringify(manifest({ icon: "icon.svg" })))],
		]);
	});

	it("requires a tag that exactly matches the manifest version", () => {
		const root = project();
		expect(() => packageExtension({ root, tag: "v1.2.0" })).toThrow(/release tag.*must equal/);
	});

	it("runs through the published command-line entry", () => {
		const root = project();
		const command = fileURLToPath(new URL("../bin/builder-extension.js", import.meta.url));
		const result = spawnSync(process.execPath, [command, "package", root, "--tag", "1.2.0"], {
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("acme-icons-1.2.0.builderext");
		expect(result.stdout).toContain("SHA-256");
	});

	it("requires repository publishing files and a current versions entry", () => {
		const root = project();
		fs.rmSync(path.join(root, "README.md"));
		expect(() => packageExtension({ root })).toThrow(/README.md/);

		write(root, "README.md", "# Icons\n");
		write(root, "versions.json", '{"1.0.0":1}');
		expect(() => packageExtension({ root })).toThrow(/current version/);
	});

	it("refuses a stale built manifest", () => {
		const root = project();
		write(root, "dist/manifest.json", JSON.stringify(manifest({ version: "1.1.0" })));
		expect(() => packageExtension({ root })).toThrow(/does not match/);
	});

	it("refuses every file outside the built entry, manifest, and icon", () => {
		const root = project();
		write(root, "dist/data.json", "{}");
		expect(() => packageExtension({ root })).toThrow(/unexpected file/);
	});

	it("refuses symbolic links", () => {
		const root = project();
		fs.symlinkSync(path.join(root, "dist/main.js"), path.join(root, "dist/linked.js"));
		expect(() => packageExtension({ root })).toThrow(/symbolic link/);
	});

	it("keeps input and output directories inside the project", () => {
		const root = project();
		expect(() => packageExtension({ root, dist: "../dist" })).toThrow(/inside the project root/);
		expect(() => packageExtension({ root, output: "../release" })).toThrow(/inside the project root/);
	});

	it("refuses unsafe SVG icons", () => {
		const root = project({ icon: "icon.svg" });
		write(root, "dist/icon.svg", '<svg onload="alert(1)" />');
		expect(() => packageExtension({ root })).toThrow(/event attribute/);

		write(root, "dist/icon.svg", '<svg><image href="https://example.com/icon.png" /></svg>');
		expect(() => packageExtension({ root })).toThrow(/external reference/);
	});

	it("refuses a compressed package over 10 MB", () => {
		const root = project();
		write(root, "dist/main.js", randomBytes(MAX_PACKAGE_BYTES));
		expect(() => packageExtension({ root })).toThrow(/larger than/);
	});
});
