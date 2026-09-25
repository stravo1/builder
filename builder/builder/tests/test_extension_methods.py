# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.tests.extension_fixtures import make_installation
from builder.extensions.data import ExtensionGrantRequired
from builder.extensions.methods import (
	get_method_grant,
	record_method_grant,
	run_doc_method,
	run_method,
)

EXTENSION = "acme/methods"
MODULE = "builder.builder.tests.test_extension_methods"
ECHO = f"{MODULE}.echo"


@frappe.whitelist()
def echo(word: str = "hello"):
	"""Answers with the word it was sent.

	Only the first paragraph reaches the prompt."""
	return word


@frappe.whitelist(methods=["GET"])
def read_echo():
	return "read"


@frappe.whitelist()
def form_dict_keys():
	return sorted(frappe.form_dict)


def not_whitelisted():
	return "never"


def make_page(route: str):
	return frappe.get_doc(
		{"doctype": "Builder Page", "page_name": route, "route": route, "blocks": "[]", "published": 1}
	).insert()


class TestExtensionMethods(FrappeTestCase):
	"""Every test app here is `builder`, which the floor refuses, so the floor is
	narrowed to `frappe` for all but the test that checks it."""

	def setUp(self):
		make_installation(EXTENSION, label="Methods", capabilities=["method.call"])
		floor = patch("builder.extensions.methods.REFUSED_APPS", ("frappe",))
		floor.start()
		self.addCleanup(floor.stop)

	def tearDown(self):
		frappe.db.rollback()

	def test_describes_the_method_for_the_prompt(self):
		self.assertEqual(
			get_method_grant(EXTENSION, ECHO),
			{
				"method": ECHO,
				"app": "builder",
				"description": "Answers with the word it was sent.",
				"answer": "not asked",
			},
		)

	def test_describes_only_the_methods_own_docstring(self):
		"""An undocumented method shows nothing, never a parent class's docstring."""
		self.assertEqual(get_method_grant(EXTENSION, "Builder Page.unpublish")["description"], "")

	def test_an_unanswered_method_does_not_run(self):
		self.assertRaises(ExtensionGrantRequired, run_method, EXTENSION, ECHO)

	def test_allowing_the_method_runs_it_with_its_arguments(self):
		record_method_grant(EXTENSION, ECHO)

		self.assertEqual(run_method(EXTENSION, ECHO, args={"word": "hi"}), "hi")

	def test_allowing_the_app_covers_every_method_of_it(self):
		record_method_grant(EXTENSION, ECHO, scope="app")

		self.assertEqual(run_method(EXTENSION, f"{MODULE}.form_dict_keys"), [])

	def test_the_methods_own_denial_wins_over_its_app(self):
		record_method_grant(EXTENSION, ECHO, scope="app")
		record_method_grant(EXTENSION, ECHO, denied=True)

		self.assertRaises(ExtensionGrantRequired, run_method, EXTENSION, ECHO)

	def test_a_second_answer_replaces_the_first(self):
		record_method_grant(EXTENSION, ECHO, denied=True)
		record_method_grant(EXTENSION, ECHO)

		self.assertEqual(get_method_grant(EXTENSION, ECHO)["answer"], "allowed")
		self.assertEqual(frappe.db.count("Builder Extension Method Grant", {"target": ECHO}), 1)

	def test_the_method_sees_only_its_own_arguments(self):
		"""Over HTTP, form_dict holds only what the frame sent, not this wrapper's own arguments."""
		record_method_grant(EXTENSION, ECHO, scope="app")

		keys = run_method(EXTENSION, f"{MODULE}.form_dict_keys", args={"word": "hi"})

		self.assertEqual(keys, ["word"])

	def test_refuses_a_method_that_is_not_whitelisted(self):
		record_method_grant(EXTENSION, ECHO, scope="app")

		self.assertRaises(frappe.PermissionError, run_method, EXTENSION, f"{MODULE}.not_whitelisted")

	def test_refuses_a_verb_the_method_does_not_accept(self):
		record_method_grant(EXTENSION, ECHO, scope="app")

		self.assertRaises(frappe.PermissionError, run_method, EXTENSION, f"{MODULE}.read_echo", "POST")
		self.assertEqual(run_method(EXTENSION, f"{MODULE}.read_echo", "GET"), "read")

	def test_refuses_a_name_that_is_not_a_dotted_path(self):
		self.assertRaises(frappe.ValidationError, get_method_grant, EXTENSION, "upload_file")

	def test_needs_the_capability(self):
		make_installation("acme/no-methods", label="No methods", capabilities=["data.access"])

		self.assertRaises(frappe.PermissionError, get_method_grant, "acme/no-methods", ECHO)

	def test_a_doc_method_runs_on_the_document_and_answers_with_it(self):
		page = make_page("method-grant-page")
		record_method_grant(EXTENSION, "Builder Page.unpublish")

		answer = run_doc_method(EXTENSION, "Builder Page", page.name, "unpublish")

		self.assertEqual(answer["docs"][0]["name"], page.name)
		self.assertEqual(frappe.db.get_value("Builder Page", page.name, "published"), 0)

	def test_a_doc_method_is_answered_for_by_its_doctype_and_method(self):
		page = make_page("method-grant-refused")

		self.assertRaises(
			ExtensionGrantRequired, run_doc_method, EXTENSION, "Builder Page", page.name, "unpublish"
		)

	def test_a_doc_method_takes_only_get_and_post(self):
		page = make_page("method-grant-verb")
		record_method_grant(EXTENSION, "Builder Page.unpublish")

		self.assertRaises(
			frappe.ValidationError,
			run_doc_method,
			EXTENSION,
			"Builder Page",
			page.name,
			"unpublish",
			"DELETE",
		)


class TestExtensionMethodFloor(FrappeTestCase):
	"""No answer reaches a method of frappe or builder."""

	def setUp(self):
		make_installation(EXTENSION, label="Methods", capabilities=["method.call"])

	def tearDown(self):
		frappe.db.rollback()

	def test_refuses_a_frappe_method(self):
		self.assertRaises(frappe.PermissionError, get_method_grant, EXTENSION, "frappe.client.set_value")

	def test_refuses_a_builder_method(self):
		self.assertRaises(frappe.PermissionError, record_method_grant, EXTENSION, ECHO)

	def test_refuses_a_method_of_a_frappe_doctype(self):
		self.assertRaises(frappe.PermissionError, get_method_grant, EXTENSION, "User.reset_password")

	def test_the_floor_answers_before_the_grant(self):
		"""A missing grant says "ask the user". Asking would not help here, so the floor answers first."""
		with self.assertRaises(frappe.PermissionError) as refusal:
			run_method(EXTENSION, "frappe.ping")

		self.assertNotIsInstance(refusal.exception, ExtensionGrantRequired)

	def test_refuses_an_app_grant_that_would_cover_frappe(self):
		self.assertRaises(frappe.PermissionError, record_method_grant, EXTENSION, "frappe.ping", "app")
