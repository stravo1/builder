# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Server methods an extension runs, each one answered by the user.

A doctype grant describes data. A method is code: whatever the HTTP verb, it
can write, and to any doctype. So a method has its own grant, and the user
answers it for that one method or for every method of the app that owns it. The
method's own answer wins, so a user can allow an app and still deny one method.

Methods owned by `frappe` or `builder` are refused, whatever the user answered.
`frappe.client.set_value`, `savedocs` and `builder.extensions.*` would bypass
every doctype grant, and their data reaches an extension through `data.*`. The
owner is read from the function's own module as well as from the name the
caller sent, so a method re-exported under another app's path is still refused.

A method runs as the user, the way Frappe runs it for a request. This wrapper
always runs in a POST, so it checks the verb the frame sent against the
method's own `methods=` list.
"""

import inspect

import frappe
from frappe import _
from frappe.model.base_document import get_controller
from frappe.modules.utils import load_doctype_module

from builder.extensions.access import METHOD_GRANT_DOCTYPE, assert_extension_access
from builder.extensions.data import ALLOWED, DENIED, NOT_ASKED, ExtensionGrantRequired

REFUSED_APPS = ("frappe", "builder")
SCOPES = ("method", "app")

# a doc method checks the document's own permission the way Frappe's v2 route does
DOC_PERMISSION = {"GET": "read", "POST": "write"}

MAX_DESCRIPTION_LENGTH = 500


class ServerMethod:
	"""One method an extension names: `myapp.api.export`, or `Form.get_summary`.

	`<DocType>.<method>` names a method of that doctype: a method on its
	controller class, or a function in its controller module. Frappe's v2 API
	reaches both through the doctype's name, so one grant answers for both.
	"""

	def __init__(self, key: str):
		prefix, _dot, self.method_name = (key or "").rpartition(".")
		if not prefix or not self.method_name:
			frappe.throw(_("Name a method as a dotted path, such as myapp.api.export."))
		self.key = key
		self.doctype = prefix if frappe.db.exists("DocType", prefix) else None

	@property
	def app(self) -> str:
		"""The app a grant for the whole app names."""
		if self.doctype:
			return frappe.get_doctype_app(self.doctype)
		return owning_app(self.function)

	@property
	def function(self):
		"""The function a module method or a doctype method runs."""
		if not self.doctype:
			return resolve_function(self.key)
		function = getattr(load_doctype_module(self.doctype), self.method_name, None)
		if not callable(function):
			frappe.throw(_("{0} has no method {1}.").format(self.doctype, self.method_name))
		return function

	@property
	def description(self) -> str:
		"""The first paragraph of the method's own docstring, which the consent prompt shows.

		Not `inspect.getdoc`, which falls back to a parent class's docstring. The
		prompt would then describe code the user is not being asked about.
		"""
		documented = self.function if not self.doctype else self.documented_doctype_method
		text = inspect.cleandoc(documented.__doc__ or "").split("\n\n", 1)[0]
		return text[:MAX_DESCRIPTION_LENGTH]

	@property
	def documented_doctype_method(self):
		method = getattr(get_controller(self.doctype), self.method_name, None)
		return method if callable(method) else self.function

	def assert_not_refused(self, function=None) -> None:
		apps = {self.app, owning_app(function)} if function else {self.app}
		refused = sorted(apps & set(REFUSED_APPS))
		if refused:
			frappe.throw(
				_(
					"An extension cannot run methods of {0}. It reaches their data through builder.data."
				).format(refused[0]),
				frappe.PermissionError,
			)

	def describe(self, installation: str) -> dict:
		self.assert_not_refused()
		return {
			"method": self.key,
			"app": self.app,
			"app_title": app_title(self.app),
			"description": self.description,
			"answer": method_answer(installation, self),
		}


def resolve_function(path: str):
	path = frappe.override_whitelisted_method(path)
	try:
		return frappe.get_attr(path)
	except Exception:
		frappe.throw(_("There is no method {0}.").format(path), frappe.DoesNotExistError)


def app_title(app: str) -> str:
	"""The name an app gives itself in `hooks.py`, which the consent prompt shows."""
	titles = frappe.get_hooks("app_title", app_name=app)
	return titles[0] if titles else app


def owning_app(function) -> str:
	return (getattr(function, "__module__", "") or "").split(".", 1)[0]


def assert_runnable(server_method: ServerMethod, function, verb: str) -> None:
	"""The floor, Frappe's own whitelist, and the verb the frame sent."""
	server_method.assert_not_refused(function)
	frappe.is_whitelisted(function)
	if verb not in frappe.allowed_http_methods_for_whitelisted_func.get(function, ()):
		frappe.throw(_("{0} does not accept {1}.").format(server_method.key, verb), frappe.PermissionError)


def find_method_grant(installation: str, scope: str, target: str) -> str | None:
	return frappe.db.get_value(
		METHOD_GRANT_DOCTYPE, {"installation": installation, "scope": scope, "target": target}, "name"
	)


def get_answer(installation: str, scope: str, target: str) -> str:
	name = find_method_grant(installation, scope, target)
	return frappe.db.get_value(METHOD_GRANT_DOCTYPE, name, "answer") if name else NOT_ASKED


def method_answer(installation: str, server_method: ServerMethod) -> str:
	"""The method's own answer, or its app's when nobody answered for the method."""
	own = get_answer(installation, "method", server_method.key)
	return own if own != NOT_ASKED else get_answer(installation, "app", server_method.app)


def assert_method_grant(installation: str, extension: str, server_method: ServerMethod) -> None:
	if method_answer(installation, server_method) == ALLOWED:
		return
	frappe.throw(
		_('"{0}" was not allowed to run {1}.').format(extension, server_method.key),
		ExtensionGrantRequired,
	)


def upsert_method_grant(installation: str, scope: str, target: str, answer: str) -> None:
	name = find_method_grant(installation, scope, target)
	if name:
		frappe.db.set_value(METHOD_GRANT_DOCTYPE, name, "answer", answer)
		return
	frappe.get_doc(
		{
			"doctype": METHOD_GRANT_DOCTYPE,
			"installation": installation,
			"scope": scope,
			"target": target,
			"answer": answer,
		}
	).insert()


def read_scope(scope: str) -> str:
	if scope not in SCOPES:
		frappe.throw(_("A scope must be one of: {0}").format(", ".join(SCOPES)))
	return scope


def read_verb(verb: str, allowed: tuple[str, ...]) -> str:
	verb = (verb or "").upper()
	if verb not in allowed:
		frappe.throw(_("A method call must use one of: {0}").format(", ".join(allowed)))
	return verb


def run_with_form_dict(function, args: dict):
	"""Some Frappe code reads the whole request `form_dict`, which here holds this
	wrapper's own arguments. The method sees only its own, as it would over HTTP."""
	sent = frappe.local.form_dict
	frappe.local.form_dict = frappe._dict(args)
	try:
		return frappe.call(function, **args)
	finally:
		frappe.local.form_dict = sent


@frappe.whitelist()
def get_method_grant(extension: str, method: str) -> dict:
	"""What the user answered for this method, and what the consent prompt shows."""
	installation = assert_extension_access(extension, "method.call")
	return ServerMethod(method).describe(installation)


@frappe.whitelist(methods=["POST"])
def record_method_grant(extension: str, method: str, scope: str = "method", denied: bool = False) -> dict:
	"""Write what the user answered in the Builder dialog, for the method or its app.

	The host is the only caller, for the reason `record_extension_grant` gives.
	"""
	installation = assert_extension_access(extension, "method.call", writes=METHOD_GRANT_DOCTYPE)
	server_method = ServerMethod(method)
	server_method.assert_not_refused()

	target = server_method.key if read_scope(scope) == "method" else server_method.app
	upsert_method_grant(installation, scope, target, DENIED if denied else ALLOWED)
	return server_method.describe(installation)


@frappe.whitelist(methods=["POST"])
def run_method(extension: str, method: str, verb: str = "POST", args: dict | None = None):
	"""A module method, or a function in a doctype's controller module."""
	installation = assert_extension_access(extension, "method.call")
	server_method = ServerMethod(method)
	server_method.assert_not_refused()
	assert_method_grant(installation, extension, server_method)

	function = server_method.function
	assert_runnable(server_method, function, read_verb(verb, ("GET", "POST", "PUT", "DELETE")))
	return run_with_form_dict(function, args or {})


@frappe.whitelist(methods=["POST"])
def run_doc_method(
	extension: str, doctype: str, name: str, method: str, verb: str = "POST", args: dict | None = None
) -> dict:
	"""A method on one document. Answers with the document too, the way Frappe does,
	so a frappe-ui document resource refreshes from it."""
	installation = assert_extension_access(extension, "method.call")
	server_method = ServerMethod(f"{doctype}.{method}")
	server_method.assert_not_refused()
	assert_method_grant(installation, extension, server_method)

	verb = read_verb(verb, tuple(DOC_PERMISSION))
	document = frappe.get_doc(doctype, name)
	bound = getattr(document, method, None)
	if not callable(bound):
		frappe.throw(_("{0} has no method {1}.").format(doctype, method), frappe.DoesNotExistError)
	assert_runnable(server_method, getattr(bound, "__func__", bound), verb)

	document.check_permission(DOC_PERMISSION[verb])
	message = document.run_method(method, **(args or {}))
	document.apply_fieldlevel_read_permissions()
	return {"message": message, "docs": [document.as_dict()]}
