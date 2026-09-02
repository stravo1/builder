# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import base64
import shutil
import uuid
from pathlib import Path

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_files_path, now

from builder.extensions.constants import (
	CAPABILITIES,
	ENTRY_FILE,
	EXTENSION_NAME_PATTERN,
	EXTENSIONS_FOLDER,
	ICON_PATTERN,
	MAX_SOURCE_BYTES,
	VERSION_PATTERN,
)

GRANT_DOCTYPE = "Builder Extension Grant"
STATE_DOCTYPE = "Builder Extension State"


class BuilderUserExtension(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		checksum: DF.Data | None
		description: DF.SmallText | None
		enabled: DF.Check
		extension: DF.Data
		granted_capabilities: DF.SmallText | None
		icon: DF.Data | None
		installed_on: DF.Datetime | None
		label: DF.Data | None
		user: DF.Link
		version: DF.Data
	# end: auto-generated types

	def autoname(self):
		# a uuid, and (user, extension) is looked up by field, the way Builder
		# Token looks up (extension, key). The name is also the install directory,
		# so it must hold no separator a path could read
		if not self.name:
			self.name = str(uuid.uuid4())

	def before_insert(self):
		self.installed_on = now()

	def validate(self):
		self.validate_identity()
		self.validate_icon()
		self.validate_capabilities()

	def on_trash(self):
		self.delete_extension_state()
		self.delete_extension_grants()
		self.delete_extension_files()

	@property
	def install_path(self) -> str:
		"""This user's own copy. Private, so nothing but Builder reads it."""
		return get_files_path(f"{EXTENSIONS_FOLDER}/{self.name}", is_private=True)

	@property
	def capabilities(self) -> list[str]:
		return frappe.parse_json(self.granted_capabilities or "[]")

	@property
	def source(self) -> str:
		"""The built entry, which the editor posts into a frame.

		The frame runs at an opaque origin and sends no session, so no route can
		check who is asking. The editor reads this instead, under its own session,
		and hands the frame the code.
		"""
		entry = Path(self.install_path) / ENTRY_FILE
		if not entry.is_file():
			frappe.throw(_('"{0}" has no installed {1}.').format(self.extension, ENTRY_FILE))

		size = entry.stat().st_size
		if size > MAX_SOURCE_BYTES:
			frappe.throw(
				_('"{0}" is {1} bytes, and {2} is the most one extension may hold.').format(
					self.extension, size, MAX_SOURCE_BYTES
				)
			)
		return entry.read_text()

	@property
	def icon_data_uri(self) -> str | None:
		"""None when the package ships no icon, and the editor then draws its own glyph.

		A data URI rather than a URL, because the editor reads it with the list and
		no public route serves one user's files.
		"""
		if not self.icon:
			return None
		icon = Path(self.install_path) / self.icon
		if not icon.is_file():
			return None
		return f"data:image/svg+xml;base64,{base64.b64encode(icon.read_bytes()).decode()}"

	def validate_identity(self):
		if not EXTENSION_NAME_PATTERN.match(self.extension or ""):
			frappe.throw(_("Extension must read as publisher/name, in lowercase."))
		if not VERSION_PATTERN.match(self.version or ""):
			frappe.throw(_("Version must hold only letters, digits, dots, plus signs and hyphens."))

	def validate_icon(self):
		if self.icon and not ICON_PATTERN.match(self.icon):
			frappe.throw(_("Icon must name one SVG file in the install root, such as icon.svg."))

	def validate_capabilities(self):
		# parse_json raises on text that is not JSON at all, which would reach the
		# user as a traceback instead of the message below
		try:
			granted = self.capabilities
		except ValueError:
			granted = None

		if not isinstance(granted, list):
			frappe.throw(_("Granted Capabilities must be a JSON list."))

		unknown = sorted(set(granted) - set(CAPABILITIES))
		if unknown:
			frappe.throw(_("Unknown capabilities: {0}").format(", ".join(unknown)))

	def delete_extension_files(self):
		"""This user's copy alone. Another user's copy is another directory."""
		shutil.rmtree(self.install_path, ignore_errors=True)

	def delete_extension_state(self):
		"""A state row is a Link to this record, so Frappe refuses the delete while one stands."""
		for state in frappe.get_all(STATE_DOCTYPE, filters={"installation": self.name}, pluck="name"):
			frappe.delete_doc(STATE_DOCTYPE, state, ignore_permissions=True)

	def delete_extension_grants(self):
		"""What this user allowed, and nobody else's answer.

		Nothing the extension made goes with it. A doctype holds the site's data,
		a token styles every page, and a client script runs for every visitor, so
		all three outlive one user leaving.
		"""
		grants = frappe.get_all(
			GRANT_DOCTYPE, filters={"user": self.user, "extension": self.extension}, pluck="name"
		)
		for grant in grants:
			frappe.delete_doc(GRANT_DOCTYPE, grant, ignore_permissions=True)
