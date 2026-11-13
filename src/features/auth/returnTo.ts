const RETURN_PATHS = new Set([
  '/account/profile',
  '/escuela/diagnostico',
  '/escuela/inscripcion',
  '/escuela/alumno',
  '/escuela/docente',
]);

export function customerReturnTo(value: string | null): string {
  if (value && (RETURN_PATHS.has(value) || /^\/subprogramas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) return value;
  return '/account';
}
