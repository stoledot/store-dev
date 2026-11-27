import type { APIRoute } from "astro";
import { env } from 'cloudflare:workers';
import { createPlanConTemas } from "../../../../features/lecturas/db";


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
        name: string;
        description: string;
        temas: string[];
    }

	try {
		const { customerId, lecturaId, name, description, temas } = plan as Plan;

		const success = await createPlanConTemas(env.DB, Number(customerId), Number(lecturaId), String(name), String(description), Array.isArray(temas) ? temas : []);
		if (!success) {
			return Response.json({ error: "No se pudo crear el plan de lecturas." }, { status: 502 });
		}
		return Response.json({ success: true }, { status: 201 });
	} catch (error) {
		console.error("Error al conectar con Supabase:", error);
		return Response.json({ error: "No se pudo conectar con la base de datos." }, { status: 502 });
	}
};
