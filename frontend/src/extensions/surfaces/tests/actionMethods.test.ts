import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("frappe-ui", () => ({ toast: { error: toastError } }));

import { bridge } from "../../host/bridge";
import {
	createPortChannel,
	type Dispatcher,
	type PortChannel,
	unknownMethod,
} from "frappe-builder-extension-sdk/transport";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { actionMethods, invokeAction } from "../actionMethods";

const register = actionMethods["actions.register"].run;
const unregister = actionMethods["actions.unregister"].run;
const run = actionMethods["actions.run"].run;

const icons: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/main.js",
	capabilities: [],
};
const charts: InstalledExtension = { ...icons, name: "other/charts" };

const dispatcherFor =
	(methods: Record<string, (params: unknown) => unknown>): Dispatcher =>
	(method, params) => {
		const handler = methods[method];
		if (!handler) throw unknownMethod(method);
		return handler(params);
	};

/** A channel whose far end answers, standing in for the extension's entry frame. */
const entryFrame = (answer: (params: unknown) => unknown = () => "done") => {
	const pair = new MessageChannel();
	const host = createPortChannel(pair.port1);
	const frame = createPortChannel(pair.port2, dispatcherFor({ "action.invoke": answer }));
	return { host, frame };
};

const connected = (extension: InstalledExtension, answer?: (params: unknown) => unknown) => {
	const { host, frame } = entryFrame(answer);
	bridge.connect(extension.name, host);
	return { host, frame };
};

let channels: PortChannel[] = [];

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	toastError.mockClear();
	// the failure paths log on purpose, so an author sees a stack (B2)
	logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	logged.mockRestore();
	channels.forEach((channel) => channel.close());
	channels = [];
	[icons, charts].forEach((extension) => bridge.teardown(extension.name));
});

describe("register", () => {
	it("takes an action name", () => {
		expect(() => register({ name: "icons.pick" }, icons)).not.toThrow();
	});

	it("refuses a nameless registration", () => {
		expect(() => register({}, icons)).toThrow(/name/);
	});

	it("refuses to unregister a name it never held", () => {
		expect(() => unregister({ name: "ghost" }, icons)).toThrow(/No action/);
	});

	it("scopes an action to the extension that registered it", async () => {
		register({ name: "icons.pick" }, icons);
		const { frame } = connected(charts);
		channels.push(frame);

		await invokeAction(charts, "icons.pick");

		expect(toastError).toHaveBeenCalled();
	});
});

describe("invokeAction", () => {
	it("calls into the extension's entry frame", async () => {
		const answer = vi.fn(() => "picked");
		const { frame } = connected(icons, answer);
		channels.push(frame);
		register({ name: "icons.pick" }, icons);

		const result = await invokeAction(icons, "icons.pick", { blockId: "block-1" });

		expect(answer).toHaveBeenCalledWith({ action: "icons.pick", context: { blockId: "block-1" } });
		expect(result).toBe("picked");
	});

	it("tells the user when the action is not registered", async () => {
		const { frame } = connected(icons);
		channels.push(frame);

		await invokeAction(icons, "icons.pick");

		expect(toastError).toHaveBeenCalledWith(expect.stringContaining("icons.pick"));
	});

	it("tells the user when no frame is connected", async () => {
		register({ name: "icons.pick" }, icons);

		await invokeAction(icons, "icons.pick");

		expect(toastError).toHaveBeenCalled();
	});

	it("tells the user when the handler throws", async () => {
		const { frame } = connected(icons, () => {
			throw new Error("no icon set");
		});
		channels.push(frame);
		register({ name: "icons.pick" }, icons);

		await invokeAction(icons, "icons.pick");

		expect(toastError).toHaveBeenCalledWith(expect.stringContaining("failed"));
		expect(logged).toHaveBeenCalledWith(expect.stringContaining("acme/icons"), expect.any(Error));
	});
});

describe("actions.run", () => {
	it("runs an action the extension owns", async () => {
		const answer = vi.fn(() => "ran");
		const { frame } = connected(icons, answer);
		channels.push(frame);
		register({ name: "icons.pick" }, icons);

		await run({ name: "icons.pick", context: { from: "panel" } }, icons);

		expect(answer).toHaveBeenCalledWith({ action: "icons.pick", context: { from: "panel" } });
	});
});

describe("teardown", () => {
	it("forgets every action the extension registered", async () => {
		const { frame } = connected(icons);
		channels.push(frame);
		register({ name: "icons.pick" }, icons);
		bridge.teardown(icons.name);

		await invokeAction(icons, "icons.pick");

		expect(toastError).toHaveBeenCalled();
	});
});
