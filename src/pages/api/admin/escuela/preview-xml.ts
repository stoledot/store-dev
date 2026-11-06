import type { APIRoute } from 'astro';
import { parseCourseXml, validateCourseXml } from '../../../../features/mathTexts/xmlCourse';
export const prerender=false;
// Admin APIs are protected by the existing /api/admin middleware gate.
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { source?: unknown };
    const source = typeof body.source === 'string' ? body.source : '';

    if (new TextEncoder().encode(source).byteLength > 1_000_000) {
      return Response.json(
        { error: 'El XML supera el límite de 1 MB.' },
        { status: 413 }
      );
    }

    const issues = validateCourseXml(source);
    if (issues.length) {
      return Response.json(
        {
          error: issues
            .slice(0, 10)
            .map(i => `Línea ${i.line}, columna ${i.column}: ${i.message} ${i.suggestion}`)
            .join('\n')
        },
        { status: 400 }
      );
    }

    const course = parseCourseXml(source);

    return Response.json(
      {
        title: course.title,
        summary: course.summary,
        author: course.author,
        units: course.units.map(u => ({
          id: u.id,
          title: u.title,
          sectionTitle: u.sectionTitle,
          lessonTitle: u.lessonTitle,
          html: u.html,
          question: u.question
            ? {
                type: u.question.type,
                prompt: u.question.prompt,
                options: u.question.options,
                maxSelections: u.question.maxSelections
              }
            : null,
          blocks: u.blocks.map(block =>
            block.type === 'activity'
              ? {
                  type: block.type,
                  question: {
                    type: block.question.type,
                    prompt: block.question.prompt,
                    options: block.question.options,
                    maxSelections: block.question.maxSelections
                  }
                }
              : block
          )
        }))
      }, // <-- Aquí se cierra correctamente el objeto de datos
      {
        headers: {
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff'
        }
      } // <-- Ahora los headers entran correctamente como segundo argumento de Response.json
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'XML inválido.' },
      { status: 400 }
    );
  }
};
;
