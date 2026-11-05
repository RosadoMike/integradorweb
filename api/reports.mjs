import { listReports, saveReport } from '../lib/supabase.mjs';

function jsonResponse(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      jsonResponse(response, 200, await listReports());
    } catch (error) {
      console.error('Error al consultar reportes:', error);
      const missingConfiguration = error.message.startsWith('Faltan las variables');
      jsonResponse(response, missingConfiguration ? 503 : 502, {
        error: missingConfiguration ? error.message : 'No se pudieron consultar los reportes.'
      });
    }
    return;
  }

  if (request.method === 'POST') {
    try {
      const report = await saveReport(request.body);
      jsonResponse(response, 200, report);
    } catch (error) {
      const invalid = error instanceof TypeError || error instanceof SyntaxError;
      if (!invalid) console.error('Error al guardar reporte:', error);
      const missingConfiguration = error.message.startsWith('Faltan las variables');
      jsonResponse(response, invalid ? 400 : missingConfiguration ? 503 : 502, {
        error: invalid ? error.message : missingConfiguration ? error.message : 'No se pudo guardar el reporte.'
      });
    }
    return;
  }

  response.setHeader('Allow', 'GET, POST');
  jsonResponse(response, 405, { error: 'Método no permitido.' });
}
