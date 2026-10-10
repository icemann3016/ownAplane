-- Owners choose what their connections exchange besides the times (export_fields, import_fields).
GRANT UPDATE (export_fields, import_fields) ON public.calendar_connections TO app_user;
