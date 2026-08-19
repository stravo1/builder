/**
 * The handlers this frame owns, and running the one the host asked for.
 *
 * A handler is a function, so it never crosses the port. The host holds only
 * the name, and calls back when a descriptor naming it is activated (B2).
 *
 * Apart from `namespaces.ts` so that `connect.ts` can register the responder
 * without the two importing each other.
 *
 * Every frame holds the handlers, because every frame imports the same entry
 * module. Only the entry frame names them to the host, so the host always calls
 * back into the frame that outlives the others. B2 asks for that guarantee, and
 * declaring at module scope gives it structurally: a dialog frame cannot leave a
 * dangling handler, because the entry frame declared the same one.
 */

export type ActionHandler = (context: Record<string, unknown>) => unknown;

const handlers = new Map<string, ActionHandler>();

export const holdAction = (name: string, handler: ActionHandler) => handlers.set(name, handler);

export const releaseAction = (name: string) => handlers.delete(name);

export const runAction = (params: unknown) => {
	const { action, context } = (params ?? {}) as { action?: string; context?: Record<string, unknown> };
	const handler = handlers.get(String(action));
	if (!handler) throw new Error(`This extension registered no action named "${action}"`);
	return handler(context ?? {});
};
