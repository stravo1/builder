# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extensions import get_enabled_extensions, remove_dev_extension, set_extension_tokens, unset_extension_token


def make_extension(**kwargs):
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": "acme/listed",
		"label": "Listed",
		"version": "1.0.0",
		"checksum": "sum123",
		"enabled": 1,
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


class TestGetEnabledExtensions(FrappeTestCase):
	def listed(self, name):
		return next((row for row in get_enabled_extensions() if row["name"] == name), None)

	def test_lists_an_enabled_extension(self):
		make_extension(extension_name="acme/enabled")

		self.assertIsNotNone(self.listed("acme/enabled"))

	def test_leaves_out_a_disabled_extension(self):
		make_extension(extension_name="acme/disabled", enabled=0)

		self.assertIsNone(self.listed("acme/disabled"))

	def test_names_the_extension_not_the_slug(self):
		make_extension(extension_name="acme/named")

		self.assertEqual(self.listed("acme/named")["name"], "acme/named")

	def test_entry_is_the_records_own_script_url(self):
		extension = make_extension(extension_name="acme/entry")

		self.assertEqual(self.listed("acme/entry")["entry"], extension.script_url)

	def test_capabilities_come_back_as_a_list(self):
		make_extension(extension_name="acme/granted", capabilities='["context.read", "block.read"]')

		self.assertEqual(self.listed("acme/granted")["capabilities"], ["context.read", "block.read"])

	def test_capabilities_are_empty_when_none_were_granted(self):
		make_extension(extension_name="acme/plain")

		self.assertEqual(self.listed("acme/plain")["capabilities"], [])

	def test_lists_an_extension_that_draws_nothing(self):
		"""Every extension needs its entry frame, whether or not it registers a surface."""
		make_extension(extension_name="acme/quiet", capabilities='["page.read"]')

		self.assertIsNotNone(self.listed("acme/quiet"))

	def test_icon_is_the_records_own_url(self):
		extension = make_extension(extension_name="acme/drawn", icon="icon.svg")

		self.assertEqual(self.listed("acme/drawn")["icon"], extension.icon_url)

	def test_icon_is_none_when_the_package_ships_none(self):
		make_extension(extension_name="acme/plainer")

		self.assertIsNone(self.listed("acme/plainer")["icon"])


class TestExtensionIcon(FrappeTestCase):
	def test_url_names_the_file_inside_the_install_folder(self):
		extension = make_extension(extension_name="acme/mark", version="2.0.0", icon="icon.svg")

		self.assertEqual(extension.icon_url, "/builder_extension_asset/acme-mark@2.0.0/icon.svg")

	def test_refuses_a_path_that_climbs_out_of_the_install_folder(self):
		with self.assertRaises(frappe.ValidationError):
			make_extension(extension_name="acme/climber", icon="../../secrets.svg")

	def test_refuses_a_format_the_editor_cannot_draw_at_any_size(self):
		with self.assertRaises(frappe.ValidationError):
			make_extension(extension_name="acme/raster", icon="icon.png")


class TestExtensionTokens(FrappeTestCase):
	def setUp(self):
		self.extension = "acme/material"
		if not frappe.db.exists("Builder Extension", {"extension_name": self.extension}):
			make_extension(extension_name=self.extension, label="Material")

		# a token insert clears a page cache, which commits, so a rollback between
		# tests does not reach these rows. Each test starts from none of its own
		for row in frappe.get_all("Builder Token", filters={"extension": ("is", "set")}, pluck="name"):
			frappe.delete_doc("Builder Token", row, force=True)

	def tokens_of(self, extension=None):
		# a Link holds the record name, which is the slug, not the extension_name
		installed = frappe.db.get_value("Builder Extension", {"extension_name": extension or self.extension})
		return frappe.get_all(
			"Builder Token",
			filters={"extension": installed},
			fields=["name", "key", "token_name", "value", "dark_value", "group"],
		)

	def shade(self, key="accent-0", **over):
		return {"key": key, "token_name": "Accent 0", "type": "Color", "value": "#4285f4", **over}

	def test_creates_a_token(self):
		set_extension_tokens(self.extension, [self.shade()])

		rows = self.tokens_of()
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["key"], "accent-0")
		self.assertEqual(rows[0]["value"], "#4285f4")

	def test_updates_in_place_rather_than_piling_up(self):
		set_extension_tokens(self.extension, [self.shade()])
		set_extension_tokens(self.extension, [self.shade(value="#ea4335")])

		rows = self.tokens_of()
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["value"], "#ea4335")

	def test_keeps_the_uuid_across_an_update(self):
		set_extension_tokens(self.extension, [self.shade()])
		first = self.tokens_of()[0]["name"]
		set_extension_tokens(self.extension, [self.shade(value="#ea4335")])

		self.assertEqual(self.tokens_of()[0]["name"], first)

	def test_survives_a_rename_by_the_user(self):
		"""The reason `key` exists. `token_name` is editable in the UI."""
		set_extension_tokens(self.extension, [self.shade()])
		row = self.tokens_of()[0]
		frappe.db.set_value("Builder Token", row["name"], "token_name", "Brand Blue")

		set_extension_tokens(self.extension, [self.shade(value="#ea4335")])

		self.assertEqual(len(self.tokens_of()), 1)

	def test_leaves_an_unmentioned_token_alone(self):
		set_extension_tokens(self.extension, [self.shade(), self.shade(key="accent-1")])
		set_extension_tokens(self.extension, [self.shade(value="#ea4335")])

		self.assertEqual(len(self.tokens_of()), 2)

	def test_unset_removes_one_token(self):
		set_extension_tokens(self.extension, [self.shade(), self.shade(key="accent-1")])
		unset_extension_token(self.extension, "accent-1")

		self.assertEqual([row["key"] for row in self.tokens_of()], ["accent-0"])

	def test_unset_is_quiet_about_a_key_that_is_gone(self):
		set_extension_tokens(self.extension, [self.shade()])
		unset_extension_token(self.extension, "never-existed")

		self.assertEqual(len(self.tokens_of()), 1)

	def test_keeps_one_extension_out_of_another(self):
		other = "acme/other-palette"
		if not frappe.db.exists("Builder Extension", {"extension_name": other}):
			make_extension(extension_name=other, label="Other")
		set_extension_tokens(self.extension, [self.shade()])
		set_extension_tokens(other, [self.shade(value="#34a853")])

		self.assertEqual(len(self.tokens_of()), 1)
		self.assertEqual(self.tokens_of(other)[0]["value"], "#34a853")

	def test_refuses_a_token_with_no_key(self):
		with self.assertRaises(frappe.ValidationError):
			set_extension_tokens(self.extension, [self.shade(key="")])

	def test_refuses_a_type_the_doctype_does_not_have(self):
		with self.assertRaises(frappe.ValidationError):
			set_extension_tokens(self.extension, [self.shade(type="Shadow")])

	def test_refuses_an_extension_that_is_not_installed(self):
		previous = frappe.conf.get("developer_mode")
		frappe.conf.developer_mode = 0
		try:
			with self.assertRaises(frappe.DoesNotExistError):
				set_extension_tokens("acme/never-installed", [self.shade()])
		finally:
			frappe.conf.developer_mode = previous

	def test_provisions_a_disabled_owner_for_a_dev_extension(self):
		extension = "acme/development"
		previous = frappe.conf.get("developer_mode")
		frappe.conf.developer_mode = 1
		try:
			set_extension_tokens(extension, [self.shade()])
		finally:
			frappe.conf.developer_mode = previous

		owner = frappe.get_doc("Builder Extension", "acme-development")
		self.assertEqual(owner.extension_name, extension)
		self.assertFalse(owner.enabled)
		self.assertEqual(owner.version, "0.0.0-dev")

	def test_removes_a_dev_extension_and_its_tokens(self):
		extension = "acme/temporary"
		previous = frappe.conf.get("developer_mode")
		frappe.conf.developer_mode = 1
		try:
			set_extension_tokens(extension, [self.shade()])
			remove_dev_extension(extension)
		finally:
			frappe.conf.developer_mode = previous

		self.assertFalse(frappe.db.exists("Builder Extension", "acme-temporary"))
		self.assertFalse(frappe.db.exists("Builder Token", {"extension": "acme-temporary", "key": "accent-0"}))
