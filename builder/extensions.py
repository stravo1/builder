# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import frappe

from builder.utils import has_page_read


@frappe.whitelist()
@has_page_read("You do not have permission to load extensions.")
def get_enabled_extensions() -> list[dict]:
	"""Every enabled extension, in the shape the editor host mounts a frame from."""
	names = frappe.get_all("Builder Extension", filters={"enabled": 1}, pluck="name")
	return [describe_extension(name) for name in names]


def describe_extension(name: str) -> dict:
	"""Reads the whole document, because the entry and the grants are derived, not stored.

	Rebuilding the asset path in this method, or in the client, would give it a
	second owner. The record has no public_url field for the same reason.
	"""
	extension = frappe.get_cached_doc("Builder Extension", name)
	return {
		"name": extension.extension_name,
		"label": extension.label,
		"icon": extension.icon_url,
		"entry": extension.script_url,
		"capabilities": extension.granted_capabilities,
	}


TOKEN_TYPES = {"Color", "Dimension", "Font"}
TOKEN_FIELDS = ("token_name", "type", "value", "dark_value", "group")
DEV_EXTENSION_VERSION = "0.0.0-dev"

RESOURCE_DOCTYPE = "Builder Extension Resource"


def find_extension(extension: str) -> str | None:
	"""The record name behind an extension_name, or None when nothing is installed."""
	return frappe.db.get_value("Builder Extension", {"extension_name": extension}, "name")


def resolve_extension(extension: str, requires_write_on: str) -> str:
	"""Turns an extension_name such as "acme/icons" into the record name a Link holds.

	The doctype names itself by slug (`builder_extension.py:51`), and the client
	only ever knows the extension_name. In developer mode, a dev extension gets a
	disabled record so its tokens have a Link owner; production still refuses an
	unknown name.

	`requires_write_on` names the doctype the caller is about to write, so the
	permission is that doctype's own rule — for a token, the rule that already
	governs a user retinting one by hand. The client capability is a separate
	check the bridge makes, and neither replaces the other.
	"""
	frappe.has_permission(requires_write_on, ptype="write", throw=True)
	name = find_extension(extension)
	if name:
		return name
	if frappe.conf.get("developer_mode"):
		return create_dev_extension(extension)
	return frappe.get_cached_doc("Builder Extension", {"extension_name": extension}).name


def create_dev_extension(extension: str) -> str:
	"""Give a session-only development extension a token owner without enabling it."""
	extension = frappe.get_doc(
		{
			"doctype": "Builder Extension",
			"extension_name": extension,
			"label": extension,
			"version": DEV_EXTENSION_VERSION,
			"enabled": 0,
		}
	).insert(ignore_permissions=True)
	return extension.name


@frappe.whitelist()
def set_extension_tokens(extension: str, tokens: list[dict]) -> None:
	"""Create or update a Builder Token per entry, keyed by (extension, key).

	`key` exists because Builder Token.name is a database-assigned uuid, so an
	extension has no other way to name the same token twice (D6).

	Never deletes what a call leaves unmentioned. Dropping a token takes an
	explicit unset.
	"""
	installed = resolve_extension(extension, "Builder Token")
	for token in frappe.parse_json(tokens):
		upsert_extension_token(installed, token)


def upsert_extension_token(extension: str, token: dict) -> None:
	key = (token.get("key") or "").strip()
	if not key:
		frappe.throw(frappe._("Every extension token needs a key."))
	if token.get("type") not in TOKEN_TYPES:
		frappe.throw(frappe._("A token type must be one of: {0}").format(", ".join(sorted(TOKEN_TYPES))))

	values = {field: token.get(field) for field in TOKEN_FIELDS if token.get(field) is not None}
	name = find_extension_token(extension, key)
	if name:
		frappe.get_doc("Builder Token", name).update(values).save()
		return

	frappe.get_doc(
		{"doctype": "Builder Token", "extension": extension, "key": key, **values}
	).insert()


@frappe.whitelist()
def unset_extension_token(extension: str, key: str) -> None:
	"""Delete one token this extension created (D6).

	Quiet about a key that is not there: an extension dropping a palette it has
	already dropped is not an error, and the end state is the one it asked for.
	"""
	name = find_extension_token(resolve_extension(extension, "Builder Token"), key)
	if name:
		frappe.delete_doc("Builder Token", name)


@frappe.whitelist()
def remove_dev_extension(extension: str) -> None:
	"""Remove a development extension and the tokens that only exist for its session."""
	if not frappe.conf.get("developer_mode"):
		frappe.throw(frappe._("Development extensions are unavailable outside developer mode."))

	name = find_extension(extension)
	if not name:
		return

	owner = frappe.get_doc("Builder Extension", name)
	if owner.enabled or owner.version != DEV_EXTENSION_VERSION:
		frappe.throw(frappe._("Only a development extension can be removed this way."))

	for token in frappe.get_all("Builder Token", filters={"extension": owner.name}, pluck="name"):
		frappe.delete_doc("Builder Token", token, ignore_permissions=True)
	frappe.delete_doc("Builder Extension", owner.name, ignore_permissions=True)


def find_extension_token(extension: str, key: str) -> str | None:
	return frappe.db.get_value("Builder Token", {"extension": extension, "key": key}, "name")


# What an extension made, so uninstall knows what it owns and no caller has to
# guess from a name. Every resource kind shares these three, which is why they
# live here rather than beside the first kind that needed them.


def record_resource(extension: str, resource_type: str, resource_name: str) -> None:
	if find_resource(extension, resource_type, resource_name):
		return
	frappe.get_doc(
		{
			"doctype": RESOURCE_DOCTYPE,
			"extension": extension,
			"resource_type": resource_type,
			"resource_name": resource_name,
		}
	).insert()


def forget_resource(extension: str, resource_type: str, resource_name: str) -> None:
	name = find_resource(extension, resource_type, resource_name)
	if name:
		frappe.delete_doc(RESOURCE_DOCTYPE, name)


def find_resource(extension: str, resource_type: str, resource_name: str) -> str | None:
	return frappe.db.get_value(
		RESOURCE_DOCTYPE,
		{"extension": extension, "resource_type": resource_type, "resource_name": resource_name},
		"name",
	)


def list_resources(extension: str, resource_type: str) -> list[str]:
	return frappe.get_all(
		RESOURCE_DOCTYPE,
		filters={"extension": extension, "resource_type": resource_type},
		pluck="resource_name",
	)
