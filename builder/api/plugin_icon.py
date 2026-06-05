import json
import mimetypes
import os
from typing import Any
from urllib.parse import quote

import frappe

_ASSET_ICON_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
_DEFAULT_ICON_FILES = (
	"icon.png",
	"icon.webp",
	"icon.jpg",
	"icon.jpeg",
	"icon.svg",
	"icons/icon.png",
	"icons/icon.webp",
)


def _normalize_lucide_icon(icon: str) -> str:
	if icon.startswith("lucide-"):
		return icon
	return f"lucide-{icon}"


def _is_lucide_icon_ref(icon: str) -> bool:
	if "/" in icon or "\\" in icon:
		return False
	ext = os.path.splitext(icon.lower())[1]
	return ext not in _ASSET_ICON_EXTENSIONS


def _is_remote_icon_url(icon: str) -> bool:
	return icon.startswith(("http://", "https://", "/"))


def _plugin_asset_url(plugin_id: str, relative_path: str) -> str:
	return (
		f"/api/method/builder.api.plugin.get_plugin_asset"
		f"?plugin_id={quote(plugin_id)}&path={quote(relative_path)}"
	)


def _safe_relative_path(path: str) -> str | None:
	path = path.strip().replace("\\", "/").lstrip("/")
	if not path or ".." in path.split("/"):
		return None
	return path


def resolve_folder_plugin_icon(
	folder_path: str, plugin_id: str, manifest: dict[str, Any]
) -> dict[str, str | None]:
	"""Return {icon, iconUrl} for a filesystem plugin folder."""
	icon_ref = manifest.get("icon")

	if icon_ref:
		if _is_remote_icon_url(icon_ref):
			return {"icon": None, "iconUrl": icon_ref}
		if _is_lucide_icon_ref(icon_ref):
			return {"icon": _normalize_lucide_icon(icon_ref), "iconUrl": None}
		relative = _safe_relative_path(icon_ref)
		if relative:
			full = os.path.join(folder_path, relative)
			if os.path.isfile(full):
				return {"icon": None, "iconUrl": _plugin_asset_url(plugin_id, relative)}

	for relative in _DEFAULT_ICON_FILES:
		full = os.path.join(folder_path, relative)
		if os.path.isfile(full):
			return {"icon": None, "iconUrl": _plugin_asset_url(plugin_id, relative)}

	return {"icon": "lucide-puzzle", "iconUrl": None}


def resolve_doctype_plugin_icon(
	plugin_icon_file: str | None, manifest: dict[str, Any]
) -> dict[str, str | None]:
	if plugin_icon_file:
		return {"icon": None, "iconUrl": plugin_icon_file}

	icon_ref = manifest.get("icon")
	if not icon_ref:
		return {"icon": "lucide-puzzle", "iconUrl": None}
	if _is_remote_icon_url(icon_ref):
		return {"icon": None, "iconUrl": icon_ref}
	if _is_lucide_icon_ref(icon_ref):
		return {"icon": _normalize_lucide_icon(icon_ref), "iconUrl": None}

	return {"icon": "lucide-puzzle", "iconUrl": None}


def _get_dev_plugins_path() -> str:
	return os.path.join(frappe.get_site_path(), "builder_plugins")


def _get_bundled_plugins_path() -> str:
	return os.path.join(frappe.get_app_path("builder"), "plugins", "examples")


def find_folder_plugin_path(plugin_id: str) -> str | None:
	for base_path in (_get_dev_plugins_path(), _get_bundled_plugins_path()):
		if not os.path.isdir(base_path):
			continue
		for entry in os.listdir(base_path):
			folder = os.path.join(base_path, entry)
			if not os.path.isdir(folder):
				continue
			manifest_path = os.path.join(folder, "manifest.json")
			if not os.path.exists(manifest_path):
				continue
			with open(manifest_path) as manifest_file:
				manifest = json.load(manifest_file)
			if manifest.get("id") == plugin_id:
				return folder
	return None


def serve_plugin_asset_file(plugin_id: str, path: str) -> None:
	relative = _safe_relative_path(path)
	if not relative:
		frappe.throw("Invalid asset path")

	folder = find_folder_plugin_path(plugin_id)
	if not folder:
		frappe.throw(f"Plugin not found: {plugin_id}")

	full_path = os.path.normpath(os.path.join(folder, relative))
	if not full_path.startswith(os.path.normpath(folder) + os.sep):
		frappe.throw("Invalid asset path")

	if not os.path.isfile(full_path):
		frappe.throw("Asset not found")

	ext = os.path.splitext(full_path)[1].lower()
	if ext not in _ASSET_ICON_EXTENSIONS:
		frappe.throw("Unsupported asset type")

	with open(full_path, "rb") as asset_file:
		content = asset_file.read()

	frappe.local.response.filename = os.path.basename(full_path)
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "inline"
	mimetype, _ = mimetypes.guess_type(full_path)
	if mimetype:
		frappe.local.response.content_type = mimetype
