import type { APIRoute } from "astro";
import { env } from 'cloudflare:workers';
import { createPlanConTemas, updatePlanConTemas, marcarTemaComoLeido } from "../../../../../../../features/lecturas/db";
import { getPorcentajeAvanceTemasPlanesEstudioCustomersLecturas } from "../../../../../../../features/lecturas/db";


export const PATCH: APIRoute = async ({ request, params }) => {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "El cuerpo debe contener JSON válido." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ error: "Los datos de la actualización de leído del tema deben ser un objeto JSON." }, { status: 400 });
    }

    interface Body {
        isCompleted: boolean;
    }

    const { idHtml } = params;
    const { planId } = params;
    const isRead = (body as Body)?.isCompleted ? true : false;
    console.log(body);

    console.log("Params:", params);

    try{
        const success = await marcarTemaComoLeido(env.DB, Number(planId), String(idHtml), isRead);
        if (!success) {
            return Response.json({ error: "No se pudo marcar el tema como leído." }, { status: 502 });
        }
    } catch (error) {
        console.error("Error al marcar el tema como leído/no leido:", error);
        return Response.json({ error: "No se pudo marcar el tema como leído/no leido correctamente." }, { status: 502 });
    }

    try
    {
        const porcentaje = await getPorcentajeAvanceTemasPlanesEstudioCustomersLecturas(env.DB, Number(planId));
        return Response.json({ success: true, porcentaje: porcentaje, tema:{isCompleted: isRead} }, { status: 200 });
    } catch (error) {
        console.error("Error al obtener el porcentaje de avance:", error);
        return Response.json({ error: "No se pudo obtener el porcentaje de avance." }, { status: 502 });
    }
    
};



