# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extension_page import attach_script, detach_script, list_scripts

SCRIPT_DOCTYPE = "Builder Client Script"


def make_extension(name: str):
	return frappe.get_doc(
		{
			"doctype": "Builder Extension",
			"extension_name": name,
			"label": name,
			"version": "1.0.0",
			"checksum": "sum123",
			"enabled": 1,
		}
	).insert()


def make_page(route: str):
	return frappe.get_doc(
		{"doctype": "Builder Page", "page_name": route, "route": route, "blocks": "[]"}
	).insert()


class TestExtensionPageScripts(FrappeTestCase):
	"""Every fixture is named for this run, and dropped at the end of it.

	`BuilderClientScript.update_script_file` commits (`builder_client_script.py:65`),
	so the rollback a Frappe test leans on never happens here.
	"""

	def setUp(self):
		self.run_id = frappe.generate_hash(length=6)
		self.extensions = []
		self.extension = self.an_extension("anim")
		self.page = make_page(f"anim-{self.run_id}")

	def tearDown(self):
		for extension in self.extensions:
			if frappe.db.exists("Builder Extension", extension.name):
				frappe.delete_doc("Builder Extension", extension.name, force=True)
		frappe.delete_doc("Builder Page", self.page.name, force=True)
		frappe.db.commit()

	def an_extension(self, label: str):
		"""Deleted in tearDown, whatever the test did to it."""
		extension = make_extension(f"acme/{label}-{self.run_id}")
		self.extensions.append(extension)
		return extension

	def attached(self):
		return frappe.get_doc("Builder Page", self.page.name).client_scripts

	def test_attaches_a_script_and_links_it_to_the_page(self):
		created = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "console.log(1)")

		self.assertEqual(created["type"], "JavaScript")
		self.assertEqual([row.builder_script for row in self.attached()], [created["name"]])

	def test_records_the_script_as_the_extensions_own(self):
		created = attach_script(self.extension.extension_name, self.page.name, "CSS", "a{}")

		self.assertTrue(
			frappe.db.exists(
				"Builder Extension Resource",
				{
					"extension": self.extension.name,
					"resource_type": "Client Script",
					"resource_name": created["name"],
				},
			)
		)

	def test_a_second_call_rewrites_rather_than_piling_up(self):
		first = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "old")
		second = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "new")

		self.assertEqual(first["name"], second["name"])
		self.assertEqual(len(self.attached()), 1)
		self.assertEqual(frappe.db.get_value(SCRIPT_DOCTYPE, first["name"], "script"), "new")

	def test_each_type_is_its_own_script(self):
		attach_script(self.extension.extension_name, self.page.name, "JavaScript", "console.log(1)")
		attach_script(self.extension.extension_name, self.page.name, "CSS", "a{}")

		self.assertEqual(len(self.attached()), 2)

	def test_refuses_a_type_builder_does_not_have(self):
		with self.assertRaises(frappe.ValidationError):
			attach_script(self.extension.extension_name, self.page.name, "Python", "x = 1")

	def test_lists_only_this_extensions_scripts(self):
		mine = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "mine")
		other = self.an_extension("other")
		attach_script(other.extension_name, self.page.name, "CSS", "theirs")

		listed = list_scripts(self.extension.extension_name, self.page.name)

		self.assertEqual([row["name"] for row in listed], [mine["name"]])

	def test_detach_unlinks_and_deletes(self):
		created = attach_script(self.extension.extension_name, self.page.name, "CSS", "a{}")

		detach_script(self.extension.extension_name, self.page.name, "CSS")

		self.assertEqual(self.attached(), [])
		self.assertFalse(frappe.db.exists(SCRIPT_DOCTYPE, created["name"]))

	def test_detach_is_quiet_about_a_script_that_is_gone(self):
		detach_script(self.extension.extension_name, self.page.name, "CSS")

		self.assertEqual(self.attached(), [])

	def test_one_extension_cannot_rewrite_anothers_script(self):
		theirs = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "theirs")
		other = self.an_extension("intruder")

		mine = attach_script(other.extension_name, self.page.name, "JavaScript", "mine")

		self.assertNotEqual(theirs["name"], mine["name"])
		self.assertEqual(frappe.db.get_value(SCRIPT_DOCTYPE, theirs["name"], "script"), "theirs")

	def test_a_script_the_user_detached_by_hand_is_not_rewritten(self):
		"""Ownership and attachment are two facts, and a rewrite needs both."""
		first = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "old")
		page = frappe.get_doc("Builder Page", self.page.name)
		page.client_scripts = []
		page.save()

		second = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "new")

		self.assertNotEqual(first["name"], second["name"])

	def test_uninstall_takes_the_extensions_scripts_with_it(self):
		created = attach_script(self.extension.extension_name, self.page.name, "JavaScript", "console.log(1)")

		frappe.delete_doc("Builder Extension", self.extension.name)

		self.assertFalse(frappe.db.exists(SCRIPT_DOCTYPE, created["name"]))
		self.assertEqual(self.attached(), [])
