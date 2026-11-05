import { listReports, saveReport } from '../lib/supabase.mjs';

function jsonResponse(body, status) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export default async function handler(request) {
  if (request.method === 'GET') {
    try {
      return jsonResponse(await listReports(), 200);
    } catch (error) {
      console.error('Error al consultar reportes:', error);
      const missingConfiguration = error.message.startsWith('Faltan las variables');
      return jsonResponse({
        error: missingConfiguration ? error.message : 'No se pudieron consultar los reportes.'
      }, missingConfiguration ? 503 : 502);
    }
  }

  if (request.method === 'POST') {
    try {
      const report = await saveReport(await request.json());
      return jsonResponse(report, 200);
    } catch (error) {
      const invalid = error instanceof TypeError || error instanceof SyntaxError;
      if (!invalid) console.error('Error al guardar reporte:', error);
      const missingConfiguration = error.message.startsWith('Faltan las variables');
      return jsonResponse({
        error: invalid ? error.message : missingConfiguration ? error.message : 'No se pudo guardar el reporte.'
      }, invalid ? 400 : missingConfiguration ? 503 : 502);
    }
  }

  return jsonResponse({ error: 'Método no permitido.' }, 405);
}
