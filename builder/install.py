from frappe.core.api.file import create_new_folder

from builder.export_import_standard_page import sync_standard_builder_pages
from builder.extensions.app_extensions import (
	check_app_extensions,
	install_app_extensions,
	remove_app_extensions,
	sync_app_extensions,
	sync_built_apps,
)
from builder.utils import (
	add_composite_index_to_web_page_view,
	sync_block_templates,
	sync_builder_tokens,
	sync_page_templates,
)


def after_install():
	create_new_folder("Builder Uploads", "Home")
	create_new_folder("Fonts", "Home/Builder Uploads")
	sync_page_templates()
	sync_block_templates()
	sync_builder_tokens()
	add_composite_index_to_web_page_view()
	sync_standard_builder_pages()
	sync_app_extensions()


def after_migrate():
	sync_page_templates()
	sync_block_templates()
	sync_builder_tokens()
	sync_standard_builder_pages()
	sync_app_extensions()


def before_app_install(app_name):
	check_app_extensions(app_name)


def after_app_install(app_name=None):
	sync_standard_builder_pages(app_name)
	install_app_extensions(app_name)


def after_app_build(built_apps):
	sync_built_apps(built_apps)


def before_app_uninstall(app_name):
	remove_app_extensions(app_name)
