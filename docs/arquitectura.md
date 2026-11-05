# Documento de arquitectura — CampoListo

## 1. Problema y requerimientos

Técnicos de servicio realizan visitas en zonas rurales con conectividad intermitente y celulares variados (Android y iOS). Necesitan capturar al menos cliente, tipo de servicio, prioridad, ubicación, diagnóstico y fecha sin perder información al cambiar de red o cerrar la pestaña.

### Requerimientos funcionales

1. Capturar y consultar reportes desde una interfaz móvil.
2. Guardar reportes en el dispositivo aun sin internet.
3. Identificar con claridad el estado local pendiente o confirmado por el servidor.
4. Sincronizar la cola al recuperar conectividad y evitar duplicados si se reintenta una solicitud.
5. Poder instalar la aplicación donde el navegador lo permita.
6. Exponer una API REST básica para consultar, registrar y comprobar disponibilidad.

### Requerimientos no funcionales

- Diseño responsive y uso con teclado/lector de pantalla en operaciones principales.
- Arranque en contexto seguro, Service Worker y shell disponible offline tras la primera visita.
- No depender de una conexión para guardar un reporte.
- Validar tipos, campos requeridos, límites de entrada y prioridad en el servidor.
- Mantener explícitas las limitaciones de almacenamiento, sincronización y persistencia de demostración.

**Fuera del alcance del prototipo:** autenticación, permisos multiempresa, adjuntos/fotografías, geolocalización, edición colaborativa, cifrado de datos en reposo gestionado por la aplicación, notificaciones push y base de datos multiusuario. No se deben cargar datos sensibles reales en esta demostración.

## 2. Arquitectura elegida

### PWA offline-first con API REST

La interfaz se entrega como archivos web estáticos desde Node.js. El manifiesto declara el nombre, iconos, colores, alcance y modo `standalone`. El Service Worker instala el shell de la aplicación, resuelve navegación desde caché si la red falla y mantiene actualizados los recursos estáticos. No intercepta ni guarda respuestas de `/api/`.

El formulario escribe primero un registro en IndexedDB. Solo después de que la transacción local termina confirma al usuario que el reporte quedó guardado. La cola se envía a `POST /api/reports` cuando hay conexión. El UUID del cliente funciona como clave idempotente: repetir el POST devuelve el reporte existente. Al cargar, la aplicación combina los registros del servidor con los del dispositivo y conserva los pendientes locales.

```text
Técnico
  └─ PWA instalada o pestaña HTTPS
       ├─ HTML/CSS/JS + Service Worker → Cache Storage (shell offline)
       ├─ Reportes locales → IndexedDB (cola y vista inmediata)
       └─ HTTPS → API REST Node → data/reports.json (prototipo persistente)
```

La API guarda el archivo JSON en disco en el servidor; IndexedDB almacena el mismo reporte más el estado de sincronización, únicamente en el origen y navegador de ese dispositivo.

### Ciclo offline y sincronización

1. La primera visita en línea descarga los archivos y el Service Worker precachea el shell.
2. El formulario crea un identificador y guarda el reporte en IndexedDB como `pending`.
3. Sin conexión, el listado y el formulario continúan disponibles; no se inicia una petición de API.
4. Con conexión, la aplicación intenta enviar reportes pendientes, incluso al pulsar **Sincronizar** o al volver a abrirla.
5. Un `201` o una respuesta idempotente `200` confirma el envío local como `synced`. Ante error, conserva el reporte pendiente y lo informa.

La app no usa Background Sync porque su compatibilidad no es uniforme (especialmente en Safari/iOS). En iOS, el usuario puede necesitar reabrir la app o pulsar sincronizar. El registro offline nunca depende de que una tarea en segundo plano se ejecute.

## 3. Comparación de alternativas

Escala: 1 = poco adecuada; 5 = muy adecuada para **este** escenario. La puntuación guía la decisión y no es una medida universal de calidad.

| Criterio | Web tradicional | API como solución aislada | PWA | Nativa separada (iOS + Android) | Multiplataforma (Flutter/React Native) |
|---|---:|---:|---:|---:|---:|
| Captura después de perder conexión | 1 | 1 | 5 | 5 | 4 |
| Un mismo producto para iOS y Android | 5 | 5 | 5 | 1 | 4 |
| Instalación sin tienda obligatoria | 2 | 1 | 4 | 1 | 2 |
| Acceso a funciones avanzadas del dispositivo | 1 | 1 | 3 | 5 | 4 |
| Facilidad de distribución y actualización | 5 | 5 | 5 | 2 | 3 |
| Tiempo/costo inicial para este prototipo | 5 | 4 | 5 | 1 | 3 |
| **Total (máximo 30)** | **19** | **17** | **27** | **15** | **20** |

- **Web tradicional:** fácil de distribuir, pero una implementación sin Service Worker ni almacenamiento local pierde disponibilidad al caer la red.
- **API orientada a servicios:** complementa la solución para intercambio y persistencia central; por sí sola no entrega interfaz ni captura offline. Por eso la API REST forma parte de la PWA y no es una alternativa de cliente completa.
- **PWA (seleccionada):** permite compartir la interfaz entre plataformas, conservar el shell y los reportes localmente y operar con tecnologías web conocidas. La instalación y algunas capacidades difieren por navegador.
- **Nativa:** ofrece el mayor control de hardware, tareas de fondo y almacenamiento, pero exige desarrollo, publicación y mantenimiento para iOS y Android.
- **Multiplataforma:** reutiliza gran parte de la lógica y mejora acceso a capacidades nativas, aunque normalmente requiere toolchains y distribución de apps; almacenamiento offline y sincronización siguen necesitando implementación propia.

La elección favorece una PWA porque los requisitos críticos son formulario, disponibilidad sin red, equipos heterogéneos y despliegue rápido, no uso intensivo de Bluetooth, sensores o tareas de fondo garantizadas.

## 4. Compatibilidad e instalación

La compatibilidad evoluciona con el navegador y la versión del sistema operativo; confirmar en equipos reales y con la matriz de soporte actual de cada navegador antes de producción.

| Plataforma y navegador | Instalación | Offline en este proyecto | Consideraciones |
|---|---|---|---|
| Android + Chrome/Chromium | Menú del navegador o prompt nativo si cumple criterios; `beforeinstallprompt` depende del navegador | Sí, tras la primera carga con SW | Opción recomendada para la prueba de Android. El prompt no se puede forzar ni garantiza aparecer. |
| Android + Edge u otro Chromium | Menú de instalar; el prompt depende del navegador | Sí si permite SW y Cache Storage | Validar la integración de instalación concreta del navegador. |
| iPhone/iPad + Safari | Compartir → **Añadir a pantalla de inicio**; no hay prompt web equivalente | Sí en versiones actuales con soporte de Service Worker/IndexedDB | Background Sync no es una dependencia; Safari puede desalojar almacenamiento por políticas del sistema. Probar inicio standalone y reconexión. |
| iOS + navegador de terceros | El mecanismo depende de la versión de iOS y del motor habilitado | Si el navegador expone Service Worker, Cache Storage e IndexedDB | No asumir equivalencia de instalación con Safari o Chrome Android. Validar en el dispositivo objetivo. |
| Escritorio + Chrome/Edge | Botón de instalación o menú | Sí | Útil para depuración; no reemplaza pruebas en teléfonos. |

No se declara una cuota fija de almacenamiento iOS: la capacidad y permanencia dependen de la versión, espacio libre, uso y políticas de WebKit/iOS. IndexedDB y Cache Storage pueden ser desalojados. Para cargas de trabajo reales, pedir persistencia cuando esté disponible, vigilar errores de cuota y mantener respaldo centralizado. El prototipo presenta error si la base IndexedDB no puede abrirse; no confirma un guardado fallido como exitoso.

### Checklist de instalación

- [ ] Abrir en HTTPS con certificado válido; para desarrollo `http://localhost`/loopback es excepción segura.
- [ ] Servir `/manifest.webmanifest` con JSON válido, nombre, `start_url`, `scope`, `display: standalone`, colores e iconos.
- [ ] Icono cuadrado estándar de al menos 192×192 y 512×512; comprobar que ambas URL devuelven imagen PNG válida.
- [ ] Registrar `/sw.js` bajo el mismo origen y alcance de la aplicación.
- [ ] Escuchar el evento `fetch`; el SW debe instalarse y la navegación offline debe usar el shell almacenado.
- [ ] Confirmar que no hay errores de registro/instalación en DevTools → Application → Service Workers y revisar almacenamiento.
- [ ] Probar después de la primera visita: abrir offline, registrar, cerrar/reabrir, reconectar y verificar sincronización.
- [ ] Probar Android con Chromium y un dispositivo Apple con Safari; documentar el flujo manual de iOS.

## 5. Entorno, ejecución y auditoría

### Herramientas recomendadas

- VS Code y Node.js 20+.
- Chrome/Edge DevTools → Application y Lighthouse.
- Ngrok o LocalTunnel para entregar HTTPS temporal a equipos físicos.
- Git/GitHub para versionado.

### Comandos

```powershell
npm run dev
npm test
ngrok http 3000
```

El servidor es una implementación Node.js sin dependencias externas. En `localhost:3000` se puede registrar un Service Worker; para teléfono real usa la URL HTTPS pública del túnel. Ngrok/LocalTunnel son servicios de terceros: usa datos de prueba, desactiva el túnel al terminar y no publiques información de clientes por un túnel temporal.

### Pruebas de aceptación reproducibles

1. **API:** `GET /api/health` responde `{"status":"ok"}`; `GET /api/reports` responde una lista JSON; crear un reporte con POST devuelve `201`, y repetir el mismo identificador devuelve `200` sin duplicarlo.
2. **Validación:** campos requeridos vacíos, prioridad desconocida, fecha inválida y texto superior al límite son rechazados.
3. **Offline:** visitar primero en línea, activar offline desde DevTools o modo avión, recargar, llenar y guardar un reporte; verificar que queda como pendiente y permanece en IndexedDB.
4. **Sincronización:** recuperar red; verificar que el reporte pasa a enviado y aparece una sola vez en `GET /api/reports`.
5. **Instalación:** Android/Chrome desde el prompt o menú; iOS/Safari desde Compartir → Añadir a pantalla de inicio.
6. **Auditoría:** correr Lighthouse desde DevTools con la URL desplegada por HTTPS; conservar versión, configuración, puntuaciones y oportunidades identificadas. Lighthouse moderno puede no incluir una categoría PWA independiente.

## 6. Despliegue, privacidad y evolución

`render.yaml` describe un servicio Node con health check y un disco persistente para el JSON. Conecta el repositorio como Blueprint en Render; la plataforma entrega HTTPS en el dominio del servicio. El disco requiere un plan de Render que lo admita. El archivo JSON solo es apropiado para demostración en una instancia; no resuelve concurrencia entre procesos ni operaciones de equipo.

Para producción real: migrar el repositorio de reportes a una base de datos administrada con índices y política de copias de seguridad; añadir autenticación/autorización, validación de roles, auditoría, cifrado/transporte, política de retención y respuesta ante conflictos. Diseñar explícitamente el acceso multiusuario antes de almacenar datos personales. IndexedDB pertenece al navegador/origen que lo creó y no es respaldo ni mecanismo de intercambio entre técnicos.
