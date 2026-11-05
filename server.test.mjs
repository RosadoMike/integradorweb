import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeReport } from './report-validation.mjs';
import { startServer } from './server.mjs';
import { listReports, saveReport } from './lib/supabase.mjs';

const validReport = {
  id: 'report-1',
  technician: 'Mariana López',
  customer: 'Taller del Norte',
  phone: '5551234567',
  serviceType: 'Reparación',
  priority: 'Alta',
  address: 'San Miguel, localidad rural',
  description: 'Revisión del equipo',
  createdAt: '2026-11-05T12:00:00.000Z',
  status: 'cualquier valor recibido'
};

test('normaliza reportes válidos y limita el estado a abierto', () => {
  const report = normalizeReport(validReport);
  assert.equal(report.status, 'abierto');
  assert.equal(report.customer, validReport.customer);
  assert.equal(report.createdAt, validReport.createdAt);
});

test('rechaza campos obligatorios vacíos', () => {
  assert.throws(() => normalizeReport({ ...validReport, customer: ' ' }), /customer/);
});

test('rechaza valores de prioridad no permitidos', () => {
  assert.throws(() => normalizeReport({ ...validReport, priority: 'Crítica' }), /prioridad/);
});

test('rechaza descripciones que exceden el límite', () => {
  assert.throws(() => normalizeReport({ ...validReport, description: 'x'.repeat(1501) }), /description/);
});

test('rechaza fecha no válida', () => {
  assert.throws(() => normalizeReport({ ...validReport, createdAt: 'ayer' }), /fecha/);
});

test('el adaptador Supabase transforma filas y usa inserción idempotente', async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousSecretKey = process.env.SUPABASE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://campolisto-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let insertedRow;

  context.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecretKey;
    globalThis.fetch = previousFetch;
  });

  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/rest\/v1\/reports/);
    assert.equal(options.headers.apikey, 'test-secret');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    insertedRow = JSON.parse(options.body);
    return new Response(JSON.stringify([{
      ...insertedRow,
      service_type: insertedRow.service_type,
      created_at: insertedRow.created_at
    }]), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };

  const saved = await saveReport({ ...validReport, id: `supabase-${randomUUID()}` });
  assert.equal(insertedRow.service_type, validReport.serviceType);
  assert.equal(saved.serviceType, validReport.serviceType);
  assert.equal(saved.syncState, 'synced');
});

test('el adaptador Supabase transforma las filas consultadas al formato de la app', async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousSecretKey = process.env.SUPABASE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://campolisto-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  context.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecretKey;
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.match(url, /order=created_at\.desc/);
    assert.equal(options.method, undefined);
    return new Response(JSON.stringify([{
      id: 'report-from-db',
      technician: 'Mariana',
      customer: 'Cliente',
      phone: '',
      service_type: 'Inspección',
      priority: 'Normal',
      address: 'Localidad',
      description: 'Revisión',
      created_at: validReport.createdAt,
      status: 'abierto'
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const [report] = await listReports();
  assert.equal(report.id, 'report-from-db');
  assert.equal(report.serviceType, 'Inspección');
  assert.equal(report.syncState, 'synced');
});

test('la API crea reportes una sola vez cuando se repite el mismo identificador', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campolisto-test-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', dataDirectory });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const report = { ...validReport, id: `test-${randomUUID()}` };

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const first = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    assert.equal(first.status, 201);

    const duplicate = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).id, report.id);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
