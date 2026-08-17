import { describe, expect, it, vi } from "vitest";
import { ChannelCallError, createPortChannel, type Dispatcher } from "./createPortChannel";

const connect = (onRequest?: { host?: Dispatcher; frame?: Dispatcher }) => {
	const channel = new MessageChannel();
	return {
		host: createPortChannel(channel.port1, onRequest?.host),
		frame: createPortChannel(channel.port2, onRequest?.frame),
	};
};

/** A channel on one side only, so a test can post whatever it likes from the other. */
const halfConnect = () => {
	const channel = new MessageChannel();
	const messages: unknown[] = [];
	channel.port2.onmessage = (message: MessageEvent) => messages.push(message.data);
	return { host: createPortChannel(channel.port1), far: channel.port2, messages };
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createPortChannel", () => {
	it("resolves a call with the far side's result", async () => {
		const { host, frame } = connect();
		frame.handle("ping", () => "pong");

		await expect(host.call("ping")).resolves.toBe("pong");
		host.close();
	});

	it("matches each response to its own call", async () => {
		const { host, frame } = connect();
		frame.handle("slow", () => new Promise((resolve) => setTimeout(() => resolve("slow"), 10)));
		frame.handle("fast", () => "fast");

		const [slow, fast] = await Promise.all([host.call("slow"), host.call("fast")]);

		expect([slow, fast]).toEqual(["slow", "fast"]);
		host.close();
	});

	it("passes params through", async () => {
		const { host, frame } = connect();
		frame.handle("echo", (params) => params);

		await expect(host.call("echo", { blockId: "abc" })).resolves.toEqual({ blockId: "abc" });
		host.close();
	});

	it("rejects with the message a handler threw", async () => {
		const { host, frame } = connect();
		frame.handle("boom", () => {
			throw new Error("no such block");
		});

		await expect(host.call("boom")).rejects.toThrow("no such block");
		host.close();
	});

	it("keeps the code when a handler throws a ChannelCallError", async () => {
		const { host, frame } = connect();
		frame.handle("denied", () => {
			throw new ChannelCallError({ message: "not granted", code: "capability_denied" });
		});

		await expect(host.call("denied")).rejects.toMatchObject({ code: "capability_denied" });
		host.close();
	});

	it("refuses a method nothing claims", async () => {
		const { host } = connect();

		await expect(host.call("nope")).rejects.toMatchObject({ code: "unknown_method" });
		host.close();
	});

	it("answers an unclaimed method from the dispatcher", async () => {
		const { host } = connect({ frame: (method, params) => ({ method, params }) });

		await expect(host.call("block.get", "abc")).resolves.toEqual({ method: "block.get", params: "abc" });
		host.close();
	});

	it("prefers an explicit handler over the dispatcher", async () => {
		const dispatcher = vi.fn(() => "table");
		const { host, frame } = connect({ frame: dispatcher });
		frame.handle("block.get", () => "handler");

		await expect(host.call("block.get")).resolves.toBe("handler");
		expect(dispatcher).not.toHaveBeenCalled();
		host.close();
	});

	it("throws when one method is claimed twice", () => {
		const { host } = connect();
		host.handle("ping", () => "one");

		expect(() => host.handle("ping", () => "two")).toThrow('"ping" already has a handler');
		host.close();
	});

	it("falls back to the dispatcher after a handler unregisters", async () => {
		const { host, frame } = connect({ frame: () => "table" });
		const unregister = frame.handle("block.get", () => "handler");
		unregister();

		await expect(host.call("block.get")).resolves.toBe("table");
		host.close();
	});

	it("delivers an event to every listener", async () => {
		const { host, frame } = connect();
		const first = vi.fn();
		const second = vi.fn();
		frame.listen("context", first);
		const stop = frame.listen("context", second);
		stop();

		host.emit("context", { breakpoint: "mobile" });
		await settled();

		expect(first).toHaveBeenCalledWith({ breakpoint: "mobile" });
		expect(second).not.toHaveBeenCalled();
		host.close();
	});

	it("rejects every pending call on close", async () => {
		const { host, frame } = connect();
		frame.handle("never", () => new Promise(() => {}));
		const pending = host.call("never");

		host.close();

		await expect(pending).rejects.toMatchObject({ code: "channel_closed" });
	});

	it("rejects a call made after close", async () => {
		const { host } = connect();
		host.close();

		await expect(host.call("ping")).rejects.toMatchObject({ code: "channel_closed" });
	});

	it("answers a request at an unsupported version instead of dropping it", async () => {
		const { host, far, messages } = halfConnect();

		far.postMessage({ v: 2, type: "request", id: 7, method: "ping" });
		await settled();

		expect(messages).toEqual([
			{ v: 1, type: "response", id: 7, error: { message: expect.any(String), code: "unsupported_version" } },
		]);
		host.close();
	});

	it("rejects a pending call when its response arrives at an unsupported version", async () => {
		const { host, far, messages } = halfConnect();
		const pending = host.call("ping");
		await settled();

		const sent = messages[0] as { id: number };
		far.postMessage({ v: 2, type: "response", id: sent.id, result: "pong" });

		await expect(pending).rejects.toMatchObject({ code: "unsupported_version" });
		host.close();
	});

	it("ignores anything that is not a port message", async () => {
		const { host, far, messages } = halfConnect();

		far.postMessage("hello");
		far.postMessage({ v: 1, type: "request", method: "ping" }); // no id, so it cannot be answered
		await settled();

		expect(messages).toEqual([]);
		host.close();
	});
});
