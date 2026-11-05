import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeReport, startServer } from './server.mjs';

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

test('la API crea reportes una sola vez cuando se repite el mismo identificador', async () => {
  const server = await startServer({ port: 0, host: '127.0.0.1' });
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
  }
});
