# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import os
import re
import shutil

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_files_path

EXTENSIONS_FOLDER = "extensions"
ENTRY_FILE = "main.js"
ASSET_ROUTE = "/builder_extension_asset"

# publisher/name, lowercase. The slash is the only separator, and the slug replaces it,
# so a name can never add a path segment to the install folder.
EXTENSION_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$")
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.+-]*$")

# every capability the bridge gates a method by
CAPABILITIES = (
	"context.read",
	"block.read",
	"block.update",
	"block.insert",
	"page.read",
	"token.write",
	"ui.dialog",
	"ui.popover",
	"data.access",
	"schema.write",
)


class BuilderExtension(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		capabilities: DF.SmallText | None
		checksum: DF.Data | None
		enabled: DF.Check
		extension_name: DF.Data
		label: DF.Data | None
		version: DF.Data
	# end: auto-generated types

	def autoname(self):
		self.name = self.slug

	def validate(self):
		self.validate_identity()
		self.validate_capabilities()

	def on_trash(self):
		self.delete_extension_files()
		self.delete_extension_grants()
		self.forget_extension_resources()

	@property
	def slug(self) -> str:
		"""The storage and URL spelling of extension_name, never a second identity."""
		return (self.extension_name or "").replace("/", "-")

	@property
	def install_folder(self) -> str:
		return f"{self.name}@{self.version}"

	@property
	def install_path(self) -> str:
		"""Private, so the asset route is the only way in. A public path would answer without
		the CORS header an opaque-origin frame needs."""
		return get_files_path(f"{EXTENSIONS_FOLDER}/{self.install_folder}", is_private=True)

	@property
	def script_url(self) -> str:
		"""Every frame loads this one file. Its chunks resolve relative to it, so they need no URL.

		No `?v=` query, deliberately. A chunk that shares a module with the entry
		imports `./main.js`, and a query would make that a second URL, a second
		module instance, and a second run of every registration in the entry. The
		asset route revalidates this one file instead, keyed by the checksum.
		"""
		return f"{ASSET_ROUTE}/{self.install_folder}/{ENTRY_FILE}"

	@property
	def granted_capabilities(self) -> list[str]:
		return frappe.parse_json(self.capabilities or "[]")

	def validate_identity(self):
		if not EXTENSION_NAME_PATTERN.match(self.extension_name or ""):
			frappe.throw(_("Extension Name must read as publisher/name, in lowercase."))
		if not VERSION_PATTERN.match(self.version or ""):
			frappe.throw(_("Version must hold only letters, digits, dots, plus signs and hyphens."))

	def validate_capabilities(self):
		# parse_json raises on text that is not JSON at all, which would reach the
		# user as a traceback instead of the message below
		try:
			granted = self.granted_capabilities
		except ValueError:
			granted = None

		if not isinstance(granted, list):
			frappe.throw(_("Capabilities must be a JSON list."))

		unknown = sorted(set(granted) - set(CAPABILITIES))
		if unknown:
			frappe.throw(_("Unknown capabilities: {0}").format(", ".join(unknown)))

	def delete_extension_files(self):
		if os.path.exists(self.install_path):
			shutil.rmtree(self.install_path)

	def forget_extension_resources(self):
		"""Drops the ownership rows, and nothing they name.

		A doctype an extension made holds the user's data, so uninstalling the
		extension must not drop the table with it. What goes is the claim of
		ownership: an admin is then free to keep the doctype or delete it in Desk.

		Like the grants below, these are Links to this record, so they have to go
		before Frappe will delete it.
		"""
		for resource in frappe.get_all(
			"Builder Extension Resource", filters={"extension": self.name}, pluck="name"
		):
			frappe.delete_doc("Builder Extension Resource", resource, ignore_permissions=True)

	def delete_extension_grants(self):
		"""A grant is a Link to this record, so Frappe refuses the delete while one stands.

		on_trash runs before the link check (`delete_doc.py:165`), so dropping them
		here is what lets an extension be uninstalled at all. A grant means nothing
		once the extension it names is gone.
		"""
		for grant in frappe.get_all("Builder Extension Grant", filters={"extension": self.name}, pluck="name"):
			frappe.delete_doc("Builder Extension Grant", grant, ignore_permissions=True)
