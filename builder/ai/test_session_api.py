from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.ai import api
from builder.ai.session import AISession
from builder.utils import Block


class TestLazySessions(FrappeTestCase):
	def setUp(self):
		self.page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Lazy Session Page",
				"draft_blocks": Block(element="div", originalElement="body").as_json(wrap_in_array=True),
			}
		).insert()

	def page_sessions(self) -> list[str]:
		return frappe.get_all(AISession.DOCTYPE, {"page": self.page.name}, pluck="name")

	def test_reading_a_page_without_chats_creates_nothing(self):
		before = frappe.db.count(AISession.DOCTYPE)

		result = api.get_ai_session(self.page.name, model="some/model")

		# the user's latest chat opens on any page, and with none the chat is blank
		self.assertEqual(result["session_id"], AISession.last_used(AISession.of_user()) or "")
		self.assertEqual(frappe.db.count(AISession.DOCTYPE), before)
		self.assertEqual(self.page_sessions(), [])

	def test_reading_reopens_the_chat_that_was_talked_to(self):
		spoken = AISession.create({"page": self.page.name})
		spoken.append_message("user", "make it blue")
		AISession.create({"page": self.page.name})

		result = api.get_ai_session(self.page.name)

		self.assertEqual(result["session_id"], spoken.name)
		self.assertEqual(len(self.page_sessions()), 2)

	def test_first_message_creates_the_session(self):
		with (
			patch.object(api.ModelRegistry, "get_default", return_value="test/model"),
			patch.object(api.ModelRegistry, "is_known_model", return_value=True),
			patch.object(api, "resolve_api_key", return_value="key"),
			patch.object(api.frappe, "enqueue") as enqueue,
		):
			result = api.run("make it blue", self.page.name, model="test/model")

		session_id = result["session_id"]
		self.assertEqual(self.page_sessions(), [session_id])
		self.assertEqual(enqueue.call_args.kwargs["session_id"], session_id)
		messages = AISession.get(session_id).get_messages()
		self.assertEqual([(m["role"], m["content"]) for m in messages], [("user", "make it blue")])


class TestDashboardChats(FrappeTestCase):
	"""A chat with no page open lives in the dashboard."""

	def run_in_dashboard(self, prompt: str):
		with (
			patch.object(api.ModelRegistry, "get_default", return_value="test/model"),
			patch.object(api.ModelRegistry, "is_known_model", return_value=True),
			patch.object(api, "resolve_api_key", return_value="key"),
			patch.object(api.frappe, "enqueue") as enqueue,
		):
			result = api.run(prompt, model="test/model")
		return result["session_id"], enqueue

	def test_a_dashboard_message_starts_a_chat_with_no_page(self):
		session_id, enqueue = self.run_in_dashboard("make a blog collection")

		self.assertFalse(frappe.db.get_value(AISession.DOCTYPE, session_id, "page"))
		self.assertIsNone(enqueue.call_args.kwargs["page_id"])
		self.assertEqual(api.get_ai_session()["session_id"], session_id)
		self.assertIn(session_id, [row["name"] for row in api.list_page_ai_sessions()])

	def test_the_same_chats_show_on_every_page_and_in_the_dashboard(self):
		page = frappe.get_doc({"doctype": "Builder Page", "page_title": "Any Page"}).insert()
		on_page = AISession.create({"page": page.name})
		on_page.append_message("user", "make it blue")

		self.assertEqual(api.get_ai_session()["session_id"], on_page.name)
		self.assertIn(on_page.name, [row["name"] for row in api.list_page_ai_sessions()])

	def test_the_open_chat_goes_on_from_any_page(self):
		# Bob is one floating window, so the chat the user has open follows them
		first = frappe.get_doc({"doctype": "Builder Page", "page_title": "First"}).insert()
		second = frappe.get_doc({"doctype": "Builder Page", "page_title": "Second"}).insert()
		chat = AISession.create({"page": first.name})
		chat.append_message("user", "make it blue")

		self.assertEqual(api.get_ai_session(session_id=chat.name)["session_id"], chat.name)
		self.assertEqual(api.get_ai_session(second.name, session_id=chat.name)["session_id"], chat.name)

	def test_another_users_chat_never_opens(self):
		chat = AISession.create({"page": None})
		chat.append_message("user", "make a blog")
		frappe.db.set_value(AISession.DOCTYPE, chat.name, "session_user", "Guest")

		self.assertFalse(AISession.can_open(chat.name))
		self.assertNotEqual(api.get_ai_session(session_id=chat.name)["session_id"], chat.name)


class TestAgentTools(FrappeTestCase):
	def test_a_chat_with_no_page_gets_no_canvas_tools(self):
		from builder.ai.agent.registry import build_default_registry

		registry = build_default_registry()
		names = lambda has_page: {s["function"]["name"] for s in registry.schemas(has_page=has_page)}  # noqa: E731

		self.assertIn("generate_page", names(True))
		self.assertNotIn("generate_page", names(False))
		self.assertIn("create_page", names(False))
		# it changes another page, named in `page`, on the server
		self.assertIn("edit_page", names(False))

	def test_every_chat_can_take_a_working_page(self):
		from builder.ai.agent.registry import build_default_registry

		registry = build_default_registry()
		names = lambda has_page: {s["function"]["name"] for s in registry.schemas(has_page=has_page)}  # noqa: E731

		self.assertIn("work_on_page", names(False))
		self.assertIn("work_on_page", names(True))

	def test_an_app_gives_bob_tools_through_the_hook(self):
		from builder.ai.agent import registry

		tool = registry.Tool(name="app_tool", side="server", description="d", parameters={}, handler=print)
		with (
			patch.object(registry.frappe, "get_hooks", return_value=["app.tools"]),
			patch.object(registry.frappe, "get_attr", return_value=lambda: [tool]),
		):
			built = registry.build_default_registry()

		self.assertIs(built.get("app_tool"), tool)

	def test_a_tool_label_names_its_step(self):
		from builder.ai.agent.loop import activity_summary

		label = ("Reading the recipes", "Read the recipes")
		self.assertEqual(activity_summary("app_tool", {}, done=False, label=label), "Reading the recipes")
		self.assertEqual(activity_summary("app_tool", {}, label=label), "Read the recipes")
		self.assertEqual(activity_summary("app_tool", {}), "App tool")


class TestPluginsWritten(FrappeTestCase):
	def setUp(self):
		self.page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Plugins Written Page",
				"draft_blocks": Block(element="div", originalElement="body").as_json(wrap_in_array=True),
			}
		).insert()

	def test_lists_each_plugin_the_replies_wrote_once_oldest_first(self):
		session = AISession.create({"page": self.page.name})
		session.append_message("user", "an icon picker")
		session.append_message("assistant", "Added Icons.", metadata={"plugins": ["bob/icons"]})
		session.append_message(
			"assistant", "Added Stickers.", metadata={"plugins": ["bob/stickers", "bob/icons"]}
		)

		self.assertEqual(AISession.plugins_written(session.name), ["bob/icons", "bob/stickers"])

	def test_a_chat_that_wrote_no_plugin_has_none(self):
		session = AISession.create({"page": self.page.name})
		session.append_message("assistant", "Made the hero blue.", metadata={"operations": 2})

		self.assertEqual(AISession.plugins_written(session.name), [])
		self.assertEqual(AISession.plugins_written(None), [])


class TestMessageContent(FrappeTestCase):
	def test_keeps_markup_in_messages_as_written(self):
		page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Markup Message Page",
				"draft_blocks": Block(element="div", originalElement="body").as_json(wrap_in_array=True),
			}
		).insert()
		session = AISession.create({"page": page.name})
		svg = '<svg viewBox="0 0 18 18"><path d="M9 1a8 8 0 1 0 8 8"></path></svg>'
		reply = 'Use `<a target="_blank" href="mailto:security@frappe.io">` for the link.'
		session.append_message("user", f"swap in this icon {svg}")
		session.append_message("assistant", reply)

		contents = [m["content"] for m in AISession.get(session.name).get_messages()]

		self.assertEqual(contents, [f"swap in this icon {svg}", reply])


class TestReadSourcesInHistory(FrappeTestCase):
	def test_a_later_turn_sees_the_addresses_an_earlier_one_read(self):
		page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Read Sources Page",
				"draft_blocks": Block(element="div", originalElement="body").as_json(wrap_in_array=True),
			}
		).insert()
		session = AISession.create({"page": page.name})
		session.append_message("user", "make it blue")
		session.append_message("assistant", "Made it blue.")
		session.append_message("user", "fill the cards from eventyay")
		sources = [
			{"url": "https://e.com/api/speakers/", "fields": ["fullname", "avatar_url"]},
			{"url": "https://e.com/"},
		]
		session.append_message("assistant", "Filled three cards.", metadata={"sources": sources})
		session.append_message("user", "now all of them")

		replies = [
			m["content"]
			for m in AISession.get(session.name).build_context_messages()
			if m["role"] == "assistant"
		]

		read = "[read_url answered: https://e.com/api/speakers/ fields=fullname,avatar_url; https://e.com/]"
		self.assertEqual(replies, ["Made it blue.", f"Filled three cards.\n\n{read}"])
