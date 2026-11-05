import { normalizeReport } from '../report-validation.mjs';

const TABLE = 'reports';
const COLUMNS = 'id,technician,customer,phone,service_type,priority,address,description,created_at,status';

function getSupabaseConfig() {
  const { SUPABASE_URL } = process.env;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error('Faltan las variables SUPABASE_URL y SUPABASE_SECRET_KEY.');
  }
  const url = new URL(SUPABASE_URL);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('SUPABASE_URL debe usar HTTPS.');
  }
  return { url: url.origin, key };
}

function toDatabaseRow(report) {
  return {
    id: report.id,
    technician: report.technician,
    customer: report.customer,
    phone: report.phone,
    service_type: report.serviceType,
    priority: report.priority,
    address: report.address,
    description: report.description,
    created_at: report.createdAt,
    status: report.status
  };
}

function fromDatabaseRow(row) {
  return {
    id: row.id,
    technician: row.technician,
    customer: row.customer,
    phone: row.phone,
    serviceType: row.service_type,
    priority: row.priority,
    address: row.address,
    description: row.description,
    createdAt: row.created_at,
    status: row.status,
    syncState: 'synced'
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Supabase request failed (${response.status}):`, detail);
    throw new Error('La base de datos no pudo completar la solicitud.');
  }
  return response.status === 204 ? null : response.json();
}

export async function listReports() {
  const rows = await supabaseRequest(`${TABLE}?select=${COLUMNS}&order=created_at.desc`);
  return rows.map(fromDatabaseRow);
}

export async function saveReport(input) {
  const report = normalizeReport(input);
  const rows = await supabaseRequest(`${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(toDatabaseRow(report))
  });

  if (rows.length > 0) return fromDatabaseRow(rows[0]);
  const existing = await supabaseRequest(`${TABLE}?select=${COLUMNS}&id=eq.${encodeURIComponent(report.id)}&limit=1`);
  if (!existing.length) throw new Error('No se pudo confirmar el reporte guardado.');
  return fromDatabaseRow(existing[0]);
}

export async function checkDatabase() {
  await supabaseRequest(`${TABLE}?select=id&limit=1`);
}

export { normalizeReport };
