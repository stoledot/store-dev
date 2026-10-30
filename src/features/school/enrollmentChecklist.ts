export type EnrollmentStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

/** Deriva el checklist exclusivamente de registros del servidor, nunca de datos enviados por el navegador. */
export async function getEnrollmentChecklist(db: any, email: string | null): Promise<EnrollmentStep[]> {
  if (!email) return [
    { id: 'login', title: 'Iniciar sesión', description: 'Accede o crea tu cuenta de alumno.', href: '/account/login', done: false },
    { id: 'programs', title: 'Conocer los programas de matemáticas o lectura', description: 'Revisa al menos uno de los programas.', href: '/programas/matematicas', done: false },
    { id: 'enrollment', title: 'Pagar inscripción', description: 'Activa tu inscripción a la escuela.', href: '/products', done: false },
    { id: 'monthly', title: 'Pagar mensualidad', description: 'Activa el periodo de estudio.', href: '/products', done: false },
    { id: 'diagnostic', title: 'Enviar diagnóstico', description: 'Cuéntanos qué sabes y qué quieres aprender.', href: '/escuela/diagnostico', done: false },
    { id: 'course', title: 'Iniciar curso asignado', description: 'Comienza tu primera lección.', href: '/escuela/mi-escuela', done: false },
  ];
  const [views, intake, enrollment, monthly, course] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM school_program_views WHERE student_email=? COLLATE NOCASE`).bind(email).first(),
    db.prepare(`SELECT submitted_at FROM school_student_intake WHERE student_email=? COLLATE NOCASE AND submitted_at IS NOT NULL AND length(trim(diagnostic_answers))>=30`).bind(email).first(),
    db.prepare(`SELECT 1 AS ok FROM school_fee_payments WHERE student_email=? COLLATE NOCASE AND fee_type='enrollment' LIMIT 1`).bind(email).first(),
    db.prepare(`SELECT 1 AS ok FROM school_fee_payments WHERE student_email=? COLLATE NOCASE AND fee_type='monthly' AND valid_until>=date('now') LIMIT 1`).bind(email).first(),
    db.prepare(`SELECT 1 AS ok FROM school_course_assignments x JOIN school_course_progress p ON p.course_id=x.course_id AND p.student_email=x.student_email COLLATE NOCASE WHERE x.student_email=? COLLATE NOCASE AND x.status IN ('active','completed') AND p.started_at IS NOT NULL LIMIT 1`).bind(email).first(),
  ]);
  return [
    { id: 'login', title: 'Iniciar sesión', description: 'Tu cuenta ya está activa.', href: '/account/profile', done: true },
    { id: 'programs', title: 'Conocer los programas de matemáticas o lectura', description: 'Revisa al menos uno de los programas.', href: '/programas/matematicas', done: Number((views as any)?.n ?? 0) > 0 },
    { id: 'enrollment', title: 'Pagar inscripción', description: 'Inscripción vigente registrada.', href: '/products', done: !!enrollment },
    { id: 'monthly', title: 'Pagar mensualidad', description: 'Mensualidad vigente registrada.', href: '/products', done: !!monthly },
    { id: 'diagnostic', title: 'Enviar diagnóstico', description: 'Tu diagnóstico quedó registrado.', href: '/escuela/diagnostico', done: !!intake },
    { id: 'course', title: 'Iniciar curso asignado', description: 'Abre tu primera lección para comenzar.', href: '/escuela/mi-escuela', done: !!course },
  ];
}
