import type { APIRoute } from "astro";
import { env } from 'cloudflare:workers';
import { createPlanConTemas, updatePlanConTemas } from "../../../../../features/lecturas/db";
import { getPorcentajeAvanceTemasPlanesEstudioCustomersLecturas } from "../../../../../features/lecturas/db";


export const POST: APIRoute = async ({ request }) => {
    let plan: unknown;

    try {
        plan = await request.json();
    } catch {
        return Response.json({ error: "El cuerpo debe contener JSON válido." }, { status: 400 });
    }

    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
        return Response.json({ error: "Los datos del plan deben ser un objeto JSON." }, { status: 400 });
    }

    interface Plan {
        customerId: number;
        lecturaId: number;
        planId: number;
        name: string;
        description: string;
        temas: string[];
    }

    try {
        const { customerId, lecturaId, planId, name, description, temas } = plan as Plan;
        
        const success = await updatePlanConTemas(env.DB, Number(planId), Number(customerId), Number(lecturaId), String(name), String(description), Array.isArray(temas) ? temas : []);
        if (!success) {
            return Response.json({ error: "No se pudo actualizar el plan de lecturas." }, { status: 502 });
        }

        const porcentaje = await getPorcentajeAvanceTemasPlanesEstudioCustomersLecturas(env.DB, Number(planId));;

        const updated = Date.now();

        const created = null;

        return Response.json({ success: true, porcentaje, created, updated }, { status: 200 });
    } catch (error) {
        console.error("Error al conectar con Supabase:", error);
        return Response.json({ error: "No se pudo conectar con la base de datos." }, { status: 502 });
    }
};
