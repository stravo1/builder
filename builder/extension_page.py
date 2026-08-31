# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Client scripts an extension puts on the page the user is editing.

Say the risk plainly, once. A client script is JavaScript on a public page at
the site's own origin. The frame sandbox does not reach it, and no capability
bounds what it does once it lands. Three things make this the trade the rest of
this API already makes, rather than a new one:

1. A user who can edit a Builder page can already add a client script by hand,
   in `PageClientScriptManager.vue`. The floor does not move.
2. A confirmation names the page at the moment a script is created, and
   remembers nothing.
3. The extension owns what it made. `Builder Extension Resource` says which
   script belongs to which extension, an extension can only rewrite or detach
   its own, and uninstall deletes them.

One script of each type per extension per page, so `attach_script` is an upsert
and needs no name from the caller. `Builder Client Script.name` is generated
(`builder_client_script.py:31`), so a caller has no way to name the same script
twice — the same problem `Builder Token.key` exists for. Here the type is
already a good enough key, and an extension that needs a second stylesheet can
put the rules in the one it has.
"""

import frappe
from frappe import _

from builder.extensions import (
	find_extension,
	forget_resource,
	list_resources,
	record_resource,
	resolve_extension,
)

SCRIPT_DOCTYPE = "Builder Client Script"
LINK_DOCTYPE = "Builder Page Client Script"
RESOURCE_TYPE = "Client Script"
SCRIPT_TYPES = ("JavaScript", "CSS")


@frappe.whitelist(methods=["POST"])
def attach_script(extension: str, page: str, script_type: str, script: str) -> dict:
	"""Create the one script of this type the extension owns on this page, or rewrite it.

	The page is saved only when a script is created, because the link row is what
	changes. Rewriting touches the script document alone.
	"""
	owner = resolve_extension(extension, SCRIPT_DOCTYPE)
	read_script_type(script_type)
	document = frappe.get_doc("Builder Page", page)

	existing = find_owned_script(owner, document, script_type)
	if existing:
		frappe.get_doc(SCRIPT_DOCTYPE, existing).update({"script": script}).save()
		return describe_script(existing)

	created = frappe.get_doc(
		{"doctype": SCRIPT_DOCTYPE, "script_type": script_type, "script": script}
	).insert()
	document.append("client_scripts", {"builder_script": created.name})
	document.save()

	record_resource(owner, RESOURCE_TYPE, created.name)
	return describe_script(created.name)


@frappe.whitelist(methods=["POST"])
def detach_script(extension: str, page: str, script_type: str) -> None:
	"""Unlink and delete this extension's script of that type, if it has one.

	Quiet about a script that is not there. An extension clearing what it has
	already cleared is not an error, and the end state is the one it asked for.
	"""
	owner = resolve_extension(extension, SCRIPT_DOCTYPE)
	read_script_type(script_type)
	document = frappe.get_doc("Builder Page", page)

	name = find_owned_script(owner, document, script_type)
	if not name:
		return

	document.client_scripts = [row for row in document.client_scripts if row.builder_script != name]
	document.save()
	frappe.delete_doc(SCRIPT_DOCTYPE, name)
	forget_resource(owner, RESOURCE_TYPE, name)


@frappe.whitelist()
def list_scripts(extension: str, page: str) -> list[dict]:
	"""This extension's own scripts on this page, and nobody else's."""
	owner = find_extension(extension)
	if not owner:
		return []

	owned = set(list_resources(owner, RESOURCE_TYPE))
	document = frappe.get_cached_doc("Builder Page", page)
	return [
		describe_script(row.builder_script) for row in document.client_scripts if row.builder_script in owned
	]


def read_script_type(script_type: str) -> str:
	if script_type not in SCRIPT_TYPES:
		frappe.throw(_("A script type must be one of: {0}").format(", ".join(SCRIPT_TYPES)))
	return script_type


def find_owned_script(extension: str, page, script_type: str) -> str | None:
	"""The one script of this type the extension has on this page.

	Ownership and attachment are two separate facts, and both have to hold: a
	script this extension made but that the user has since detached is not the
	script this page runs.
	"""
	owned = set(list_resources(extension, RESOURCE_TYPE))
	for row in page.client_scripts:
		if row.builder_script not in owned:
			continue
		if frappe.db.get_value(SCRIPT_DOCTYPE, row.builder_script, "script_type") == script_type:
			return row.builder_script
	return None


def describe_script(name: str) -> dict:
	script = frappe.get_doc(SCRIPT_DOCTYPE, name)
	return {"name": script.name, "type": script.script_type, "script": script.script}


def delete_extension_scripts(extension: str) -> None:
	"""Uninstall drops the code an extension wrote, unlike the data it modeled.

	A doctype holds the user's records, so `forget_extension_resources` keeps it.
	A client script holds the extension's own JavaScript, and leaving it behind
	would keep running an uninstalled extension's code on a published page.

	Every page loses the link first. Frappe refuses to delete a document a Link
	still names, and a forced delete would leave a row pointing at nothing.
	"""
	for name in list_resources(extension, RESOURCE_TYPE):
		if not frappe.db.exists(SCRIPT_DOCTYPE, name):
			continue
		frappe.db.delete(LINK_DOCTYPE, {"builder_script": name})
		frappe.delete_doc(SCRIPT_DOCTYPE, name, ignore_permissions=True)
