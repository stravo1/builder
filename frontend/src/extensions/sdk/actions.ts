/**
 * The handlers this frame owns, and running the one the host asked for.
 *
 * A handler is a function, so it never crosses the port. The host holds only
 * the name, and calls back when a descriptor naming it is activated (B2).
 *
 * Apart from `namespaces.ts` so that `connect.ts` can register the responder
 * without the two importing each other.
 */

import { activeSlot } from "./slots";

export type ActionHandler = (context: Record<string, unknown>) => unknown;

const handlers = new Map<string, ActionHandler>();

/**
 * Only the entry frame may own an action. Any other frame can be closed while
 * the action is still on a descriptor, and the host cannot tell which frame
 * called, so the refusal belongs here, where the slot is known.
 */
export const holdAction = (name: string, handler: ActionHandler) => {
	if (activeSlot() !== "main") {
		throw new Error(`Register actions from builder.main, not from the "${activeSlot()}" slot`);
	}
	handlers.set(name, handler);
};

export const releaseAction = (name: string) => handlers.delete(name);

export const runAction = (params: unknown) => {
	const { action, context } = (params ?? {}) as { action?: string; context?: Record<string, unknown> };
	const handler = handlers.get(String(action));
	if (!handler) throw new Error(`This extension registered no action named "${action}"`);
	return handler(context ?? {});
};
