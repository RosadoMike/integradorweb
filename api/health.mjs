import { checkDatabase } from '../lib/supabase.mjs';

function jsonResponse(body, status) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Método no permitido.' }, 405);
  }

  try {
    await checkDatabase();
    return jsonResponse({ status: 'ok' }, 200);
  } catch (error) {
    console.error('La comprobación de Supabase falló:', error);
    const missingConfiguration = error.message.startsWith('Faltan las variables');
    return jsonResponse({
      status: 'error',
      error: missingConfiguration ? error.message : 'La base de datos no está disponible.'
    }, missingConfiguration ? 503 : 502);
  }
}
