# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.tests.extension_fixtures import (
	INSTALLATION_DOCTYPE,
	drop_installations,
	make_installation,
)
from builder.extensions.app_extensions import (
	check_app_extensions,
	install_app_extensions,
	remove_app_extensions,
	sync_app_extensions,
)
from builder.extensions.constants import ENTRY_FILE
from builder.extensions.hub import assert_installable
from builder.extensions.installations import uninstall_extension

EXTENSION = "acme/bundled"
APP = "builder"


class TestAppExtension(FrappeTestCase):
	def setUp(self):
		drop_installations(EXTENSION)
		self.addCleanup(drop_installations, EXTENSION)
		self.build = Path(tempfile.mkdtemp())
		self.addCleanup(shutil.rmtree, self.build, ignore_errors=True)
		self.write_build("1.0.0")
		folders = patch(
			"builder.extensions.app_extensions.get_extension_folders",
			side_effect=lambda app: [self.build] if app == APP else [],
		)
		folders.start()
		self.addCleanup(folders.stop)

	def write_build(self, version: str):
		manifest = {
			"v": 1,
			"name": EXTENSION,
			"label": "Bundled",
			"description": "Ships with an app",
			"version": version,
			"entry": ENTRY_FILE,
		}
		(self.build / "manifest.json").write_text(json.dumps(manifest))
		(self.build / ENTRY_FILE).write_text(f"// {version}")

	def installed(self):
		return frappe.get_doc(INSTALLATION_DOCTYPE, {"extension": EXTENSION})

	def test_installs_an_app_extension_disabled(self):
		install_app_extensions(APP)

		row = self.installed()
		self.assertEqual([row.source, row.source_app, row.enabled, row.version], ["App", APP, 0, "1.0.0"])
		self.assertEqual(Path(row.release_path, ENTRY_FILE).read_text(), "// 1.0.0")

	def test_a_new_build_keeps_the_extension_enabled(self):
		install_app_extensions(APP)
		frappe.db.set_value(INSTALLATION_DOCTYPE, self.installed().name, "enabled", 1)
		self.write_build("1.1.0")

		install_app_extensions(APP)

		row = self.installed()
		self.assertEqual([row.version, row.enabled], ["1.1.0", 1])
		self.assertEqual(Path(row.release_path, ENTRY_FILE).read_text(), "// 1.1.0")

	def test_the_same_build_saves_nothing(self):
		install_app_extensions(APP)
		modified = self.installed().modified

		install_app_extensions(APP)

		self.assertEqual(self.installed().modified, modified)

	def test_refuses_the_app_when_another_source_has_the_extension(self):
		make_installation(EXTENSION, source="Hub", hub_url="https://hub.example.com")

		with self.assertRaisesRegex(frappe.ValidationError, "hub.example.com"):
			check_app_extensions(APP)

	def test_refuses_the_app_without_a_build(self):
		shutil.rmtree(self.build)

		with self.assertRaisesRegex(frappe.ValidationError, "bench build --app builder"):
			check_app_extensions(APP)

	def test_refuses_a_build_with_a_file_a_package_may_not_hold(self):
		(self.build / "index.html").write_text("<script></script>")

		with self.assertRaisesRegex(frappe.ValidationError, "index.html"):
			check_app_extensions(APP)

	def test_migrate_skips_an_extension_another_source_has(self):
		make_installation(EXTENSION, source="Hub", hub_url="https://hub.example.com")

		sync_app_extensions()

		self.assertEqual(self.installed().source, "Hub")

	def test_removes_the_extensions_of_an_app(self):
		install_app_extensions(APP)

		remove_app_extensions(APP)

		self.assertFalse(frappe.db.exists(INSTALLATION_DOCTYPE, {"extension": EXTENSION}))

	def test_refuses_to_uninstall_an_app_extension(self):
		install_app_extensions(APP)

		with self.assertRaisesRegex(frappe.ValidationError, "builder app"):
			uninstall_extension(EXTENSION)

	def test_a_hub_install_names_the_app_that_has_the_extension(self):
		install_app_extensions(APP)

		with self.assertRaisesRegex(frappe.ValidationError, "builder app"):
			assert_installable(EXTENSION)
