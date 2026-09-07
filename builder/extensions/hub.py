# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Install an extension from a Builder Hub.

The browser browses a Hub's catalog directly, but it never downloads extension
code. That crosses the trust boundary, so it happens here, on the server, under
the session user.

`install_from_hub` does only the fast part: the checks, an `Installing` row, and
a background job. `run_hub_install` is the slow part: read the exact release,
download the GitHub package, prove it against the release `package_sha256`,
re-check its contents, then fill the row and write the user's copy. The two
Hub round-trips and a 10 MB download would starve the web workers if they ran
in the request.

Builder re-validates what the Hub already validated. The Hub is trusted to point
at a release, not to have vetted it, and the sha256 is the one fact Builder
takes on faith before it checks the bytes for itself.

The Hub URL itself is not checked yet. It is a development setting, so a
plain-HTTP or localhost Hub is allowed. Milestone 7's "Hub URL safety" rules
land in `resolve_hub_url` when the setting becomes user-facing.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

import frappe
import requests
from frappe import _

from builder.extensions.access import INSTALLATION_DOCTYPE, find_own_installation
from builder.extensions.constants import (
	DEFAULT_HUB_URL,
	EXTENSION_NAME_PATTERN,
	MAX_PACKAGE_BYTES,
	PROTOCOL_VERSION,
)
from builder.extensions.installations import describe_installation
from builder.extensions.package import ValidatedPackage, validate_package
from builder.utils import has_page_read

NOT_INSTALLABLE = "You cannot install extensions."

# Where a Builder Hub mounts its extensions API. A method name is appended.
HUB_API = "api/method/builder_hub.extensions.api"
HUB_TIMEOUT = 20
PACKAGE_TIMEOUT = 30
PACKAGE_CHUNK_BYTES = 64 * 1024
# A catalog or release response is small JSON. This is room for a long README
# and no room for a Hub to stream at the worker.
MAX_METADATA_BYTES = 1024 * 1024

REQUIRED_RELEASE_KEYS = frozenset(
	{"version", "protocol_version", "manifest", "package_url", "package_size", "package_sha256", "status"}
)

# "http://", "https://", "ftp://", and protocol-relative "//".
HAS_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z\d+\-.]*://|^//")


@dataclass(frozen=True)
class Release:
	"""One exact published release, as `get_extension_release` describes it."""

	name: str
	version: str
	protocol_version: int
	manifest: dict
	package_url: str
	package_size: int
	package_sha256: str
	status: str


def resolve_hub_url() -> str:
	"""The Hub URL on Builder Settings, given a scheme and no trailing slash."""
	url = frappe.db.get_single_value("Builder Settings", "hub_url") or DEFAULT_HUB_URL
	return ensure_protocol(url)


def ensure_protocol(url: str, default_scheme: str = "http") -> str:
	"""A URL with a scheme and no trailing slash. Mirrors the editor's `ensureProtocol`.

	A bare host gets `default_scheme`, which is HTTP because a Hub URL is still a
	development setting.
	"""
	if not url:
		return url
	if not HAS_SCHEME.match(url):
		url = f"{default_scheme.rstrip(':/')}://{url}"
	return url.rstrip("/")


def get_release(hub_url: str, name: str, version: str | None) -> Release:
	"""The newest published release of `name`, or the exact `version` asked for.

	The Hub validated the manifest when it indexed the release. `validate_package`
	checks it again from the downloaded bytes, so this reads the response as it
	comes and only refuses on status, protocol and size.
	"""
	version = version or latest_version(hub_url, name)
	payload = hub_get(hub_url, "get_extension_release", {"extension_name": name, "version": version})

	release = payload.get("release")
	if not isinstance(release, dict):
		frappe.throw(_('The Hub returned no release for "{0}".').format(name))
	return read_release(name, release)


def latest_version(hub_url: str, name: str) -> str:
	"""The newest published version of `name`, from the Hub's release list."""
	payload = hub_get(hub_url, "get_extension", {"name": name, "protocol_version": PROTOCOL_VERSION})
	releases = payload.get("releases") or []
	if not releases:
		frappe.throw(_('"{0}" has no published release on this Hub.').format(name))
	return releases[0]["version"]  # the Hub sends them newest first


def read_release(name: str, release: dict) -> Release:
	"""One release dict into a checked `Release`, or a refusal naming what is wrong."""
	missing = REQUIRED_RELEASE_KEYS - release.keys()
	if missing:
		frappe.throw(_("The Hub release is missing {0}.").format(", ".join(sorted(missing))))

	built = Release(
		name=name,
		version=release["version"],
		protocol_version=int(release["protocol_version"]),
		manifest=release["manifest"],
		package_url=release["package_url"],
		package_size=int(release["package_size"]),
		package_sha256=release["package_sha256"],
		status=release["status"],
	)

	if built.status != "Published":
		frappe.throw(_("This release is {0}, so it cannot be installed.").format(built.status))
	if built.protocol_version > PROTOCOL_VERSION:
		frappe.throw(_('"{0}" needs a newer Builder to run.').format(name))
	if built.package_size > MAX_PACKAGE_BYTES:
		frappe.throw(_("This release is larger than Builder installs."))
	return built


def hub_get(hub_url: str, method: str, params: dict) -> dict:
	"""One GET to a Builder Hub API method. Answers with its `message` payload."""
	try:
		response = requests.get(
			f"{hub_url}/{HUB_API}.{method}",
			params=params,
			timeout=HUB_TIMEOUT,
			headers={"User-Agent": "FrappeBuilder/1.0"},
		)
	except requests.RequestException:
		frappe.throw(_("Could not reach the Builder Hub at {0}.").format(hub_url))

	if not response.ok:
		frappe.throw(hub_error(response))
	if len(response.content) > MAX_METADATA_BYTES:
		frappe.throw(_("The Hub sent more than a release listing should need."))

	body = response.json()
	if not isinstance(body, dict) or not isinstance(body.get("message"), dict):
		frappe.throw(_("The Hub response was not in the form Builder expects."))
	return body["message"]


def hub_error(response: requests.Response) -> str:
	"""The Hub's own message for a failed call. A Frappe Hub carries one; fall back
	to the status line when it does not."""
	try:
		messages = frappe.parse_json(response.json().get("_server_messages") or "[]")
		if messages:
			return frappe.parse_json(messages[0]).get("message") or str(messages[0])
	except (ValueError, TypeError, AttributeError):
		pass
	return _("The Builder Hub returned an error ({0}).").format(response.status_code)


def download_package(release: Release) -> bytes:
	"""The `.builderext` bytes for one release, proven against its sha256.

	Stops the stream past the release `package_size`, and refuses a download
	whose sha256 does not match `release.package_sha256`. `package_url` is not
	address-checked yet, for the same reason `resolve_hub_url` is not.
	"""
	try:
		with requests.get(
			release.package_url,
			timeout=PACKAGE_TIMEOUT,
			stream=True,
			headers={"User-Agent": "FrappeBuilder/1.0"},
		) as response:
			if not response.ok:
				frappe.throw(_("The package download failed ({0}).").format(response.status_code))
			package_bytes = read_capped(response, release.package_size)
	except requests.RequestException:
		frappe.throw(_("Could not download the extension package."))

	if hashlib.sha256(package_bytes).hexdigest() != release.package_sha256:
		frappe.throw(_("The downloaded package does not match the release checksum."))
	return package_bytes


def read_capped(response: requests.Response, limit: int) -> bytes:
	"""Every byte of the stream, or a refusal the moment it passes `limit`."""
	package_bytes = bytearray()
	for chunk in response.iter_content(PACKAGE_CHUNK_BYTES):
		package_bytes.extend(chunk)
		if len(package_bytes) > limit:
			frappe.throw(_("The extension package is larger than its release says."))
	return bytes(package_bytes)


@frappe.whitelist(methods=["POST"])
@has_page_read(NOT_INSTALLABLE)
def install_from_hub(name: str, version: str | None = None) -> dict:
	"""Start a Hub install for the session user, and answer with its panel row.

	The row comes back `Installing`. A background job downloads and checks the
	package, then flips the row to `Ready` or `Failed` and sends a
	`builder_extension_install` realtime event. Nothing slow runs in this request.
	"""
	assert_installable(name)

	hub_url = resolve_hub_url()
	version = version or latest_version(hub_url, name)
	installation = create_pending_installation(name, version)

	frappe.enqueue(
		run_hub_install,
		queue="default",
		timeout=300,
		enqueue_after_commit=True,
		job_id=f"hub-install::{frappe.session.user}::{name}",
		deduplicate=True,
		installation=installation,
		name=name,
		version=version,
		hub_url=hub_url,
		user=frappe.session.user,
	)
	return describe_installation(installation)


def run_hub_install(installation: str, name: str, version: str, hub_url: str, user: str) -> None:
	"""Download, check and finish one pending installation, then send the result.

	A failure rolls back the job's writes and marks the row `Failed` with the
	reason, so the panel can show it with a Retry.
	"""
	try:
		release = get_release(hub_url, name, version)
		package = validate_package(download_package(release), name, release.version)
		apply_release(frappe.get_doc(INSTALLATION_DOCTYPE, installation), hub_url, release, package)
		state = "Ready"
	except Exception as error:
		frappe.db.rollback()
		frappe.log_error(title="Hub extension install failed")
		state = "Failed"
		frappe.db.set_value(
			INSTALLATION_DOCTYPE,
			installation,
			{"install_state": state, "install_error": str(error) or _("The install failed.")},
		)

	frappe.db.commit()
	frappe.publish_realtime(
		"builder_extension_install", {"extension": name, "state": state}, user=user, after_commit=True
	)


def assert_installable(name: str) -> None:
	"""Refuse before the job is queued: a guest, a site with extensions off, a bad
	name, or a name this user already has installed or installing. A `Failed` row
	is not a block, so the panel's Retry starts a fresh job on it."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to install extensions."), frappe.PermissionError)
	if frappe.db.get_single_value("Builder Settings", "disable_extensions"):
		frappe.throw(_("Extensions are turned off for this site."))
	if not EXTENSION_NAME_PATTERN.match(name or ""):
		frappe.throw(_("An extension name reads as publisher/name, in lowercase."))

	existing = find_own_installation(name)
	if not existing:
		return
	state, source = frappe.db.get_value(INSTALLATION_DOCTYPE, existing, ["install_state", "source_url"])
	if state == "Installing":
		frappe.throw(_('"{0}" is already installing.').format(name))
	if state != "Failed":
		frappe.throw(_('"{0}" is already installed from {1}.').format(name, source or _("a directory")))


def create_pending_installation(name: str, version: str) -> str:
	"""An `Installing` row for the job to finish. Reuses a `Failed` row so Retry works.

	`label` stands in as the name until the manifest arrives.
	"""
	existing = find_own_installation(name)
	if existing:
		frappe.db.set_value(
			INSTALLATION_DOCTYPE,
			existing,
			{"install_state": "Installing", "install_error": None, "version": version},
		)
		return existing

	return (
		frappe.get_doc(
			{
				"doctype": INSTALLATION_DOCTYPE,
				"user": frappe.session.user,
				"extension": name,
				"label": name,
				"version": version,
				"install_state": "Installing",
				"enabled": 0,
			}
		)
		.insert()
		.name
	)


def apply_release(doc, source_url: str, release: Release, package: ValidatedPackage) -> None:
	"""Fill the pending row from the release and write the user's copy.

	`requested_capabilities` holds the manifest's ask; `granted_capabilities`
	starts empty, and the user grants from the panel.
	"""
	manifest = package.manifest
	doc.update(
		{
			"source_url": source_url,
			"label": manifest["label"],
			"description": manifest["description"],
			"icon": manifest.get("icon"),
			"version": release.version,
			"checksum": release.package_sha256[:12],
			"requested_capabilities": frappe.as_json(manifest["capabilities"]),
			"granted_capabilities": frappe.as_json([]),
			"install_state": "Ready",
			"install_error": None,
			"enabled": 1,
		}
	)
	doc.save()
	doc.write_extension_files(package.files)
