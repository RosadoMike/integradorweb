const DATABASE_NAME = 'campolisto';
const DATABASE_VERSION = 1;
const STORE_NAME = 'reports';
const form = document.querySelector('#report-form');
const formMessage = document.querySelector('#form-message');
const reportList = document.querySelector('#report-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const filterSelect = document.querySelector('#filter-select');
const syncButton = document.querySelector('#sync-button');
const installButton = document.querySelector('#install-button');
const connectionStatus = document.querySelector('#connection-status');
let database;
let installPrompt;
let reports = [];
let synchronizing = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

function storeRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error('No se pudo acceder al almacenamiento local.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el almacenamiento local.'));
  });
}

function saveReport(report) {
  return storeRequest('readwrite', (store) => store.put(report));
}

function getLocalReports() {
  return storeRequest('readonly', (store) => store.getAll());
}

function setFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle('error', isError);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function renderReports() {
  const query = searchInput.value.trim().toLocaleLowerCase('es-MX');
  const filter = filterSelect.value;
  const filtered = reports
    .filter((report) => filter === 'all' || (filter === 'pending' ? report.syncState !== 'synced' : report.syncState === 'synced'))
    .filter((report) => [report.customer, report.technician, report.address, report.serviceType, report.description]
      .some((value) => value.toLocaleLowerCase('es-MX').includes(query)))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  reportList.replaceChildren();
  for (const report of filtered) {
    const article = document.createElement('article');
    article.className = 'report-item';

    const topline = document.createElement('div');
    topline.className = 'report-topline';
    const titleBlock = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = report.customer;
    const meta = document.createElement('div');
    meta.className = 'report-meta';
    for (const detail of [report.serviceType, report.priority, formatDate(report.createdAt)]) {
      const item = document.createElement('span');
      item.textContent = detail;
      meta.append(item);
    }
    titleBlock.append(title, meta);

    const badge = document.createElement('span');
    badge.className = `report-badge${report.syncState === 'synced' ? ' synced' : ''}`;
    badge.textContent = report.syncState === 'synced' ? 'Enviado' : 'Pendiente';
    topline.append(titleBlock, badge);

    const description = document.createElement('p');
    description.className = 'report-description';
    description.textContent = `${report.address} · ${report.description}`;
    article.append(topline, description);
    reportList.append(article);
  }

  const pendingCount = reports.filter((report) => report.syncState !== 'synced').length;
  document.querySelector('#total-count').textContent = String(reports.length);
  document.querySelector('#pending-count').textContent = String(pendingCount);
  document.querySelector('#synced-count').textContent = String(reports.length - pendingCount);
  emptyState.hidden = filtered.length !== 0;
  reportList.hidden = filtered.length === 0;
}

async function loadReports() {
  reports = await getLocalReports();
  renderReports();
  if (!navigator.onLine) return;

  try {
    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('No se pudieron cargar los reportes del servidor.');
    const serverReports = await response.json();
    const localById = new Map(reports.map((report) => [report.id, report]));
    for (const serverReport of serverReports) {
      const localReport = localById.get(serverReport.id);
      if (!localReport || localReport.syncState === 'synced') {
        await saveReport({ ...serverReport, syncState: 'synced' });
      }
    }
    reports = await getLocalReports();
    renderReports();
  } catch (error) {
    setFormMessage(`No se pudo consultar el servidor. Tus reportes locales siguen disponibles: ${error.message}`, true);
  }
}

async function synchronizeReports() {
  if (synchronizing) return;
  if (!navigator.onLine) {
    setFormMessage('Sin conexión: el reporte queda guardado y se enviará cuando vuelva internet.');
    return;
  }

  synchronizing = true;
  syncButton.disabled = true;
  syncButton.setAttribute('aria-busy', 'true');
  try {
    const pending = reports.filter((report) => report.syncState !== 'synced');
    for (const report of pending) {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? 'No se pudo enviar un reporte al servidor.');
      }
      const savedReport = await response.json();
      await saveReport({ ...savedReport, syncState: 'synced' });
    }
    reports = await getLocalReports();
    renderReports();
    setFormMessage(pending.length ? `${pending.length} reporte(s) sincronizado(s).` : 'Todo está sincronizado.');
  } catch (error) {
    setFormMessage(`${error.message} Tus reportes siguen guardados en este dispositivo.`, true);
  } finally {
    synchronizing = false;
    syncButton.disabled = false;
    syncButton.removeAttribute('aria-busy');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const report = {
    id: crypto.randomUUID(),
    technician: values.technician.trim(),
    customer: values.customer.trim(),
    phone: values.phone.trim(),
    serviceType: values.serviceType,
    priority: values.priority,
    address: values.address.trim(),
    description: values.description.trim(),
    createdAt: new Date().toISOString(),
    status: 'abierto',
    syncState: 'pending'
  };

  try {
    await saveReport(report);
    reports = await getLocalReports();
    renderReports();
    form.reset();
    setFormMessage(navigator.onLine ? 'Reporte guardado en este dispositivo.' : 'Reporte guardado sin conexión. Se sincronizará al recuperar la señal.');
    if (navigator.onLine) await synchronizeReports();
  } catch (error) {
    setFormMessage(`No se pudo guardar el reporte: ${error.message}`, true);
  }
});

syncButton.addEventListener('click', synchronizeReports);
searchInput.addEventListener('input', renderReports);
filterSelect.addEventListener('change', renderReports);

function updateConnectionStatus() {
  const online = navigator.onLine;
  connectionStatus.classList.toggle('offline', !online);
  document.querySelector('#connection-label').textContent = online ? 'En línea' : 'Modo sin conexión';
}

window.addEventListener('online', () => {
  updateConnectionStatus();
  synchronizeReports();
});
window.addEventListener('offline', updateConnectionStatus);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  setFormMessage('CampoListo se instaló correctamente en tu dispositivo.');
});

async function startApp() {
  updateConnectionStatus();
  if (!('indexedDB' in window)) throw new Error('Este navegador no permite guardar reportes offline.');
  database = await openDatabase();
  await loadReports();
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js');
  }
  if (navigator.onLine) await synchronizeReports();
}

startApp().catch((error) => {
  setFormMessage(`No se pudo iniciar la aplicación: ${error.message}`, true);
  console.error('Error al iniciar CampoListo:', error);
});
