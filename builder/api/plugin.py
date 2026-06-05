import json
import os
from typing import Any

import frappe

from builder.api.plugin_icon import resolve_folder_plugin_icon, serve_plugin_asset_file
from builder.utils import has_page_write


def _can_run_plugins() -> bool:
	if frappe.session.user == "Administrator":
		return True
	return frappe.has_permission("Builder Page", ptype="write")


def _can_manage_plugins() -> bool:
	return frappe.has_permission("Builder Plugin", ptype="write")


def _get_dev_plugins_path() -> str:
	return os.path.join(frappe.get_site_path(), "builder_plugins")


def _get_bundled_plugins_path() -> str:
	return os.path.join(frappe.get_app_path("builder"), "plugins", "examples")


def _read_plugin_folder(folder_path: str, is_dev: bool) -> dict[str, Any] | None:
	manifest_path = os.path.join(folder_path, "manifest.json")
	main_path = os.path.join(folder_path, "main.js")
	if not os.path.exists(manifest_path) or not os.path.exists(main_path):
		return None

	with open(manifest_path) as manifest_file:
		manifest = json.load(manifest_file)

	ui_path = os.path.join(folder_path, manifest.get("ui", "ui.html"))
	ui_html = ""
	if os.path.exists(ui_path):
		with open(ui_path) as ui_file:
			ui_html = ui_file.read()

	with open(main_path) as main_file:
		main_script = main_file.read()

	plugin_id = manifest["id"]
	icon_fields = resolve_folder_plugin_icon(folder_path, plugin_id, manifest)

	return {
		"id": plugin_id,
		"name": manifest.get("name", plugin_id),
		"manifest": manifest,
		"mainScript": main_script,
		"uiHtml": ui_html,
		"enabled": True,
		"isDev": is_dev,
		**icon_fields,
	}


def _load_folder_plugins(base_path: str, is_dev: bool) -> list[dict[str, Any]]:
	if not os.path.isdir(base_path):
		return []

	plugins: list[dict[str, Any]] = []
	for entry in sorted(os.listdir(base_path)):
		folder = os.path.join(base_path, entry)
		if not os.path.isdir(folder):
			continue
		plugin = _read_plugin_folder(folder, is_dev)
		if plugin:
			plugins.append(plugin)
	return plugins


def _load_doctype_plugins() -> list[dict[str, Any]]:
	if not frappe.db.exists("DocType", "Builder Plugin"):
		return []

	records = frappe.get_all(
		"Builder Plugin",
		filters={"enabled": 1},
		fields=["name"],
		order_by="plugin_name asc",
	)
	plugins: list[dict[str, Any]] = []
	for record in records:
		doc = frappe.get_doc("Builder Plugin", record.name)
		plugins.append(doc.to_plugin_bundle())
	return plugins


@frappe.whitelist()
def list_plugins() -> list[dict[str, Any]]:
	if not _can_run_plugins():
		frappe.throw("You do not have permission to run Builder plugins")

	plugins_by_id: dict[str, dict[str, Any]] = {}

	for plugin in _load_doctype_plugins():
		plugins_by_id[plugin["id"]] = plugin

	for plugin in _load_folder_plugins(_get_bundled_plugins_path(), is_dev=False):
		plugins_by_id.setdefault(plugin["id"], plugin)

	for plugin in _load_folder_plugins(_get_dev_plugins_path(), is_dev=True):
		plugins_by_id[plugin["id"]] = plugin

	return list(plugins_by_id.values())


@frappe.whitelist()
def get_plugin_asset(plugin_id: str, path: str):
	if not _can_run_plugins():
		frappe.throw("You do not have permission to run Builder plugins")
	serve_plugin_asset_file(plugin_id, path)


@frappe.whitelist()
def get_plugin_bundle(plugin_id: str) -> dict[str, Any]:
	if not _can_run_plugins():
		frappe.throw("You do not have permission to run Builder plugins")

	for plugin in list_plugins():
		if plugin["id"] == plugin_id:
			return plugin

	frappe.throw(f"Plugin not found: {plugin_id}")


@frappe.whitelist()
@has_page_write("You do not have permission to reload Builder plugins.")
def reload_dev_plugins() -> list[dict[str, Any]]:
	return list_plugins()
