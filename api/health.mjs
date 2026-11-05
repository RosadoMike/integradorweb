import { checkDatabase } from '../lib/supabase.mjs';

function jsonResponse(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    jsonResponse(response, 405, { error: 'Método no permitido.' });
    return;
  }

  try {
    await checkDatabase();
    jsonResponse(response, 200, { status: 'ok' });
  } catch (error) {
    console.error('La comprobación de Supabase falló:', error);
    const missingConfiguration = error.message.startsWith('Faltan las variables');
    jsonResponse(response, missingConfiguration ? 503 : 502, {
      status: 'error',
      error: missingConfiguration ? error.message : 'La base de datos no está disponible.'
    });
  }
}
