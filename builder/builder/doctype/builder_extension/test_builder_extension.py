# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import json
import os
import shutil

import frappe
from frappe.tests.utils import FrappeTestCase


def make_extension(**kwargs):
	"""The name is deterministic, so every inserting test names its own extension."""
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": "acme/icons",
		"label": "Icon Library",
		"version": "1.2.0",
		"checksum": "a1b2c3",
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


class TestBuilderExtension(FrappeTestCase):
	def test_name_is_the_slug_of_the_extension_name(self):
		extension = make_extension(extension_name="acme/icons")
		self.assertEqual(extension.name, "acme-icons")
		self.assertEqual(extension.extension_name, "acme/icons")

	def test_script_url_points_at_the_entry_of_the_installed_version(self):
		extension = make_extension(extension_name="acme/urls", version="1.2.0", checksum="a1b2c3")
		self.assertEqual(extension.script_url, "/builder_extension_asset/acme-urls@1.2.0/main.js")

	def test_the_entry_url_carries_no_query(self):
		"""A chunk sharing a module with the entry imports `./main.js`.

		A `?v=` query would make the frame's URL a different one, so the browser
		would hold two copies of the entry and run every registration twice. The
		asset route revalidates this file by ETag instead.
		"""
		extension = make_extension(extension_name="acme/query", checksum="a1b2c3")
		self.assertNotIn("?", extension.script_url)

	def test_install_path_stays_out_of_the_public_files_folder(self):
		extension = make_extension(extension_name="acme/private")
		self.assertIn("/private/files/extensions/", extension.install_path)

	def test_a_new_checksum_busts_the_entry_cache(self):
		"""Through the ETag, not the URL. The URL is stable so a chunk can name it."""
		extension = make_extension(extension_name="acme/cache")
		before = extension.checksum
		extension.db_set("checksum", "d4e5f6")
		self.assertNotEqual(extension.checksum, before)

	def test_a_new_version_moves_the_install_folder(self):
		extension = make_extension(extension_name="acme/versions", version="2.0.0")
		self.assertEqual(extension.install_folder, "acme-versions@2.0.0")

	def test_extension_name_must_read_as_publisher_slash_name(self):
		for bad_name in ["icons", "Acme/Icons", "acme/icons/extra", "../etc"]:
			with self.assertRaises(frappe.ValidationError):
				make_extension(extension_name=bad_name)

	def test_version_refuses_a_path_separator(self):
		with self.assertRaises(frappe.ValidationError):
			make_extension(extension_name="acme/badversion", version="1.0/../..")

	def test_an_unknown_capability_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			make_extension(
				extension_name="acme/unknowncap",
				capabilities=json.dumps(["context.read", "block.destroy"]),
			)

	def test_granted_capabilities_reads_the_stored_list(self):
		extension = make_extension(
			extension_name="acme/caps",
			capabilities=json.dumps(["context.read", "block.read"]),
		)
		self.assertEqual(extension.granted_capabilities, ["context.read", "block.read"])

	def test_capabilities_must_be_a_list(self):
		with self.assertRaises(frappe.ValidationError):
			make_extension(extension_name="acme/dictcaps", capabilities=json.dumps({"context.read": True}))

	def test_capabilities_that_are_not_json_are_refused(self):
		"""A bare key reads as text, not JSON, and must not reach the user as a traceback."""
		with self.assertRaises(frappe.ValidationError):
			make_extension(extension_name="acme/textcaps", capabilities="context.read")

	def test_deleting_the_record_removes_the_install_directory(self):
		extension = make_extension(extension_name="acme/trash")
		install_path = extension.install_path
		os.makedirs(install_path, exist_ok=True)
		self.addCleanup(shutil.rmtree, install_path, ignore_errors=True)

		extension.delete()

		self.assertFalse(os.path.exists(install_path))
