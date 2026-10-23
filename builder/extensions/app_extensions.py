# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Extensions that a Frappe app ships with its code.

An app names its built extension folders in the `builder_extensions` hook,
relative to the app's source folder:

    builder_extensions = ["extension/dist"]

`bench build` builds them through the app's root `package.json`. Builder
installs each one disabled when the app installs, applies a new build on each
migrate, and removes it with the app. The Hub plays no part.
"""

import hashlib
from functools import cached_property
from pathlib import Path

import frappe
from frappe import _

from builder.extensions.access import INSTALLATION_DOCTYPE, find_installation
from builder.extensions.constants import MANIFEST_FILE
from builder.extensions.installations import describe_source
from builder.extensions.package import ValidatedPackage, validate_files


class AppExtension:
	"""One built extension folder that an app names in its hook."""

	def __init__(self, app: str, folder: Path):
		self.app = app
		self.folder = folder

	@cached_property
	def package(self) -> ValidatedPackage:
		"""The folder's files, keyed by path, through the same rules as a Hub package."""
		if not (self.folder / MANIFEST_FILE).is_file():
			frappe.throw(
				_("The {0} app has no built extension at {1}. Run bench build --app {0}.").format(
					self.app, self.folder
				)
			)
		files = self.folder.rglob("*")
		return validate_files(
			{
				file.relative_to(self.folder).as_posix(): file.read_bytes()
				for file in sorted(files)
				if file.is_file()
			}
		)

	@property
	def name(self) -> str:
		return self.package.manifest["name"]

	@cached_property
	def checksum(self) -> str:
		digest = hashlib.sha256()
		for path, content in self.package.files.items():
			digest.update(path.encode() + b"\0" + content)
		return digest.hexdigest()[:12]

	@property
	def conflict(self) -> str | None:
		"""Why the site cannot take this extension: another source has its name."""
		row = frappe.db.get_value(
			INSTALLATION_DOCTYPE,
			{"extension": self.name},
			["source", "hub_url", "source_app"],
			as_dict=True,
		)
		if not row or row.source_app == self.app:
			return None
		return _('The {0} app cannot install "{1}". The site has it from {2}.').format(
			self.app, self.name, describe_source(row)
		)

	def assert_installable(self) -> None:
		if self.conflict:
			frappe.throw(self.conflict)

	def install(self) -> None:
		"""Insert it disabled, or apply a new build. An update keeps `enabled` as a manager left it."""
		self.assert_installable()
		installation = find_installation(self.name)
		if installation:
			doc = frappe.get_doc(INSTALLATION_DOCTYPE, installation)
		else:
			doc = frappe.new_doc(INSTALLATION_DOCTYPE).update({"extension": self.name, "enabled": 0})
		if doc.checksum == self.checksum:
			return
		doc.flags.ignore_permissions = True
		doc.apply_package(self.package, self.checksum, {"source": "App", "source_app": self.app})


def get_extension_folders(app: str) -> list[Path]:
	return [
		Path(frappe.get_app_source_path(app), folder)
		for folder in frappe.get_hooks("builder_extensions", app_name=app)
	]


def get_app_extensions(app: str) -> list[AppExtension]:
	return [AppExtension(app, folder) for folder in get_extension_folders(app)]


def check_app_extensions(app: str) -> None:
	"""Runs before Frappe writes any of the app, so a refusal leaves nothing behind."""
	for extension in get_app_extensions(app):
		extension.assert_installable()


def install_app_extensions(app: str) -> None:
	for extension in get_app_extensions(app):
		extension.install()


def sync_app_extensions() -> None:
	"""On migrate. One app's extension that fails must not stop the migrate for every app, so it is skipped."""
	for app in frappe.get_installed_apps():
		for extension in get_app_extensions(app):
			try:
				extension.install()
			except frappe.ValidationError as error:
				print(f"Skipped an extension of the {app} app: {error}")


def remove_app_extensions(app: str) -> None:
	for installation in frappe.get_all(INSTALLATION_DOCTYPE, filters={"source_app": app}, pluck="name"):
		frappe.delete_doc(INSTALLATION_DOCTYPE, installation, ignore_permissions=True)
