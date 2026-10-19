-- Guarda la respuesta entregada por el alumno en ejercicios, cuestionarios y tareas.
-- Ejecutar después de 0041_school_progress.sql. No borra el progreso existente.
ALTER TABLE school_lesson_progress
  ADD COLUMN student_response TEXT NOT NULL DEFAULT '';

ALTER TABLE school_lesson_progress
  ADD COLUMN submission_at TEXT;
