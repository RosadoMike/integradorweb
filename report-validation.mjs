export function normalizeReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('El reporte debe ser un objeto.');
  }
  const required = ['id', 'technician', 'customer', 'serviceType', 'priority', 'address', 'description', 'createdAt'];
  for (const field of required) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      throw new TypeError(`El campo "${field}" es obligatorio.`);
    }
  }
  const limits = { id: 64, technician: 80, customer: 100, phone: 30, serviceType: 40, priority: 20, address: 180, description: 1500 };
  for (const [field, maxLength] of Object.entries(limits)) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > maxLength)) {
      throw new TypeError(`El campo "${field}" no es válido (máximo ${maxLength} caracteres).`);
    }
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new TypeError('La fecha del reporte no es válida.');
  }
  if (!['Normal', 'Alta', 'Urgente'].includes(input.priority)) {
    throw new TypeError('La prioridad no es válida.');
  }

  return {
    id: input.id.trim(),
    technician: input.technician.trim(),
    customer: input.customer.trim(),
    phone: typeof input.phone === 'string' ? input.phone.trim() : '',
    serviceType: input.serviceType.trim(),
    priority: input.priority,
    address: input.address.trim(),
    description: input.description.trim(),
    createdAt: new Date(input.createdAt).toISOString(),
    status: 'abierto'
  };
}
