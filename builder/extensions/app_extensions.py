# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Extensions that a Frappe app ships with its code.

An app names its extension project folders in the `builder_extensions` hook,
relative to the app's source folder:

    builder_extensions = ["extension"]

A project folder has the SDK's layout: the build in `dist/`, and a
`README.md` beside it. `bench build` builds it through the app's root
`package.json`. Builder
installs each one disabled when the app installs, applies a new build on each
migrate, and removes it with the app. The Hub plays no part.
"""

import hashlib
import subprocess
import sys
from functools import cached_property
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import get_sites

from builder.extensions.access import INSTALLATION_DOCTYPE, find_installation
from builder.extensions.constants import MANIFEST_FILE
from builder.extensions.installations import describe_source
from builder.extensions.package import ValidatedPackage, validate_files

# the SDK's names, so an app's project reads as any extension project does
BUILD_FOLDER = "dist"
# in Builder Hub's order: DESCRIPTION.md is for users, README.md for developers
README_FILES = ("DESCRIPTION.md", "README.md")


class AppExtension:
	"""One extension project folder that an app names in its hook."""

	def __init__(self, app: str, folder: Path):
		self.app = app
		self.folder = folder
		self.build = folder / BUILD_FOLDER

	@cached_property
	def package(self) -> ValidatedPackage:
		"""The build's files, keyed by path, through the same rules as a Hub package."""
		if not (self.build / MANIFEST_FILE).is_file():
			frappe.throw(
				_("The {0} app has no built extension at {1}. Run bench build --app {0}.").format(
					self.app, self.build
				)
			)
		files = self.build.rglob("*")
		return validate_files(
			{
				file.relative_to(self.build).as_posix(): file.read_bytes()
				for file in sorted(files)
				if file.is_file()
			}
		)

	@property
	def readme(self) -> str | None:
		files = [self.folder / name for name in README_FILES]
		return next((file.read_text() for file in files if file.is_file()), None)

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
		"""Why the site cannot take this extension: the Hub or another app has its name.

		A dev row is a throwaway record of a dev server load, so the app takes it over.
		"""
		row = frappe.db.get_value(
			INSTALLATION_DOCTYPE,
			{"extension": self.name},
			["source", "hub_url", "source_app"],
			as_dict=True,
		)
		if not row or row.source_app == self.app or row.source == "Development":
			return None
		return _('The {0} app cannot install "{1}". The site has it from {2}.').format(
			self.app, self.name, describe_source(row)
		)

	def assert_installable(self) -> None:
		if self.conflict:
			frappe.throw(self.conflict)

	def install(self) -> None:
		"""Insert it disabled, or apply a new build. An update keeps `enabled` as a manager left it.

		A taken over dev row starts disabled too, so a manager sees the trust dialog before it runs.
		"""
		self.assert_installable()
		installation = find_installation(self.name)
		if installation:
			doc = frappe.get_doc(INSTALLATION_DOCTYPE, installation)
		else:
			doc = frappe.new_doc(INSTALLATION_DOCTYPE).update({"extension": self.name})
		if doc.checksum == self.checksum and doc.readme == self.readme:
			return
		if doc.source != "App":
			doc.enabled = 0
		doc.flags.ignore_permissions = True
		doc.apply_package(
			self.package, self.checksum, {"source": "App", "source_app": self.app, "readme": self.readme}
		)


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
	installed = frappe.get_installed_apps()
	# a build syncs every site on the bench, and one without Builder has no extensions table
	if "builder" not in installed:
		return
	for app in installed:
		for extension in get_app_extensions(app):
			try:
				extension.install()
			except frappe.ValidationError as error:
				print(f"Skipped an extension of the {app} app: {error}")


def sync_built_apps(built_apps: list[str]) -> None:
	"""After `bench build`. `bench update` migrates before it builds, so without this a new build waits for the next migrate.

	A build has no site, so each site syncs in its own process. A site that cannot connect,
	such as in a Docker image build, is skipped with a warning.
	"""
	if not any(get_extension_folders(app) for app in built_apps):
		return
	for site in get_sites():
		command = [sys.executable, "-m", "frappe.utils.bench_helper", "frappe", "--site", site, "execute"]
		result = subprocess.run(
			[*command, "builder.extensions.app_extensions.sync_app_extensions"],
			cwd=frappe.local.sites_path,
			capture_output=True,
			text=True,
		)
		if result.returncode:
			print(f"Skipped Builder extensions on {site}: {result.stderr.strip()[-300:]}")


def remove_app_extensions(app: str) -> None:
	for installation in frappe.get_all(INSTALLATION_DOCTYPE, filters={"source_app": app}, pluck="name"):
		frappe.delete_doc(INSTALLATION_DOCTYPE, installation, ignore_permissions=True)
