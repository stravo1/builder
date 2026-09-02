# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What the editor loads, and how an extension's code reaches a frame.

An extension frame runs at an opaque origin. It sends no cookie, so no route can
tell who is asking for a file, and one user's copy cannot be served safely by
URL. The editor reads the built entry here instead, under its own session, and
posts the code into the frame it mounts.
"""

import json

import frappe
from frappe import _

from builder.extensions.access import INSTALLATION_DOCTYPE, assert_extension_access
from builder.extensions.constants import CAPABILITIES, DEV_EXTENSION_VERSION
from builder.utils import has_page_read


@frappe.whitelist()
@has_page_read("You do not have permission to load extensions.")
def get_enabled_extensions() -> list[dict]:
	"""This user's enabled extensions, in the shape the editor host mounts a frame from.

	A development installation is left out. It has no files, and the browser adds
	its own entry for it from the dev server, so listing it here would give one
	extension two entries and two entry frames.
	"""
	installations = frappe.get_all(
		INSTALLATION_DOCTYPE,
		filters={
			"user": frappe.session.user,
			"enabled": 1,
			"version": ["!=", DEV_EXTENSION_VERSION],
		},
		pluck="name",
	)
	return [describe_extension(name) for name in installations]


def describe_extension(installation: str) -> dict:
	"""Reads the whole document, because the icon is derived, not stored.

	The icon travels as a data URI. Building a URL for it would need a route that
	serves one user's private files to an anonymous request, which is the thing
	this design does not do.

	The source is not here. It is one call per extension, made once and shared by
	the five frames that mount it, so a list of five extensions does not carry
	five bundles.
	"""
	extension = frappe.get_cached_doc(INSTALLATION_DOCTYPE, installation)
	return {
		"name": extension.extension,
		"label": extension.label,
		"description": extension.description,
		"icon": extension.icon_data_uri,
		"checksum": extension.checksum,
		"capabilities": extension.capabilities,
	}


@frappe.whitelist()
def get_extension_source(extension: str) -> str:
	"""The built entry this user installed."""
	installation = assert_extension_access(extension)
	return frappe.get_cached_doc(INSTALLATION_DOCTYPE, installation).source


@frappe.whitelist(methods=["POST"])
def install_dev_extension(extension: str) -> str:
	"""Give an extension served from a dev server an installation for this session.

	The gate needs no bypass this way: a development extension passes it the same
	way an installed one does.

	An extension the user already has installed keeps that installation. Building
	an extension you also run is the ordinary case, and a second record under one
	name is not something the unique key allows or the user wants.

	The capabilities come from the constant, never from the caller. The dev server
	declares what it asks for, and the browser bridge narrows to that list.
	"""
	assert_developer_mode()
	frappe.has_permission("Builder Page", ptype="read", throw=True)

	existing = find_own_installation(extension)
	if existing:
		return existing

	installation = frappe.get_doc(
		{
			"doctype": INSTALLATION_DOCTYPE,
			"user": frappe.session.user,
			"extension": extension,
			"label": extension,
			"version": DEV_EXTENSION_VERSION,
			"granted_capabilities": json.dumps(list(CAPABILITIES)),
			"enabled": 1,
		}
	).insert()
	return installation.name


@frappe.whitelist(methods=["POST"])
def remove_dev_extension(extension: str) -> None:
	"""Remove a development installation and the tokens that only exist for its session.

	Quiet about an installation this method did not make. The name may belong to
	an extension the user really has installed, and the dev session borrowed it.
	"""
	assert_developer_mode()

	installation = find_own_installation(extension)
	if not installation:
		return

	document = frappe.get_doc(INSTALLATION_DOCTYPE, installation)
	if document.version != DEV_EXTENSION_VERSION:
		return

	from builder.extensions.tokens import delete_extension_tokens

	delete_extension_tokens(extension)
	document.delete()


def find_own_installation(extension: str) -> str | None:
	"""This user's installation, enabled or not. The gate wants only the enabled one."""
	return frappe.db.get_value(
		INSTALLATION_DOCTYPE, {"user": frappe.session.user, "extension": extension}, "name"
	)


def assert_developer_mode() -> None:
	if not frappe.conf.get("developer_mode"):
		frappe.throw(_("Development extensions are unavailable outside developer mode."))
