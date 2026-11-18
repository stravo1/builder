"""Pages beyond the one a turn starts on.

Bob only proposes a new page: it is created when the user confirms the card at the end of
the turn (agent/page_changes.py), and built the turn after. Any chat can take an existing
page to work on, such as a dashboard chat, which starts with none.
"""

import frappe

from builder.ai.agent.registry import Tool


def run_create_page(ctx, args: dict) -> str:
	return ctx.page_changes.propose_page(args.get("title"), args.get("route"), args.get("brief"))


create_page = Tool(
	name="create_page",
	side="server",
	handler=run_create_page,
	description=(
		"Propose a NEW page for this site, only when the user asks for another page (an empty open "
		"page is built in place with generate_page). Nothing is created now: the user confirms on a "
		"card when your turn ends, and you build it in the turn after, from `brief`, without "
		"touching their canvas. Read the site's routes first and fit this one into them."
	),
	parameters={
		"type": "object",
		"properties": {
			"title": {"type": "string", "description": "The page title, e.g. 'Careers'."},
			"route": {"type": "string", "description": "A free URL path, e.g. 'careers' or 'menu/drinks'."},
			"brief": {
				"type": "string",
				"description": (
					"What the page holds, as you'd brief generate_page: purpose, sections, the site "
					"page whose look it should match. Shown to the user on the card."
				),
			},
		},
		"required": ["title", "route", "brief"],
	},
)


def run_work_on_page(ctx, args: dict) -> str:
	from builder.ai.agent.tools.query import resolve_page_reference

	page_id, why = resolve_page_reference(str(args.get("page") or ""))
	if not page_id:
		return f"FAILED: {why}."
	if not frappe.has_permission("Builder Page", "write", doc=page_id):
		return "FAILED: this user cannot edit that page. Tell them, and do what you can without it."
	return ctx.work_on_page(page_id)


work_on_page = Tool(
	name="work_on_page",
	side="server",
	handler=run_work_on_page,
	label=("Opening a page to work on", "Opened a page to work on"),
	description=(
		"Make another existing page this turn's working page, as if it were open in the editor. "
		"Every page tool then works on it: edit_page, generate_page for an empty page, page "
		"scripts, page settings, the page data script and preview_page. Its outline comes back. "
		"Edits apply at once, and the user can revert the turn. Switch before you change "
		"anything: a turn works on one page."
	),
	parameters={
		"type": "object",
		"properties": {
			"page": {
				"type": "string",
				"description": "The page's id, route, title, or a URL of it on this site.",
			},
		},
		"required": ["page"],
	},
)

TOOLS = [create_page, work_on_page]
