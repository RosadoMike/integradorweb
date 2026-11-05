# CampoListo — PWA para técnicos en campo

Prototipo funcional offline-first para registrar visitas de servicio técnico desde celulares Android, iPhone o computadora. Cada reporte se guarda primero en el dispositivo con IndexedDB; al recuperar la conexión, se envía a una API REST. La interfaz y el formulario siguen disponibles sin internet después de la primera carga.

## Requisitos

- Node.js 20 o superior.
- Un navegador actualizado: Chrome/Edge en Android, Safari en iOS, o un navegador de escritorio.
- No se requieren dependencias adicionales para ejecutar la aplicación.

## Ejecutar localmente

```powershell
node --version
npm run dev
```

Abre <http://localhost:3000>. `localhost` se considera un contexto seguro para desarrollo: permite probar el manifiesto y registrar el Service Worker sin instalar certificados. En otros dispositivos de la misma red, utiliza un túnel HTTPS:

```powershell
ngrok http 3000
```

Abre en el teléfono la URL HTTPS que muestra ngrok. También puedes iniciar un túnel temporal con `npx localtunnel --port 3000`; el dispositivo debe usar la URL pública HTTPS. No uses `http://<IP-local>` para validar la instalación PWA: los navegadores no lo consideran contexto seguro.

## Funcionalidad implementada

- Formulario responsivo de visita: técnico, cliente, teléfono, servicio, prioridad, domicilio y descripción.
- Guardado local en IndexedDB antes de cualquier envío al servidor; indicador de conexión y cola de reportes pendientes.
- Sincronización REST idempotente por identificador cuando vuelve internet, al abrir la aplicación o al pulsar **Sincronizar**.
- Service Worker con precache del shell y estrategia stale-while-revalidate para recursos estáticos; navegación con fallback offline. Las respuestas API no se cachean.
- Manifiesto instalable, modo standalone, colores de tema, iconos estándar de 192 y 512 px, icono SVG y variante maskable.
- Filtro por estado, búsqueda, resumen de reportes y estados de envío.
- API REST JSON: `GET /api/health`, `GET /api/reports` y `POST /api/reports`.
- Almacenamiento de demostración en `data/reports.json`. El servidor crea el directorio y el archivo al guardar el primer reporte.

## Pruebas y auditoría

```powershell
npm test
```

Para comprobar la instalación en Chrome/Edge: abre DevTools → **Application** → revisa **Manifest**, **Service Workers** y **Storage**. Para probar modo avión: carga primero la aplicación, registra un reporte sin conexión y confirma que aparece como pendiente; recupera la conexión y comprueba que cambia a enviado. Verifica también `GET /api/health` y `GET /api/reports`.

Ejecuta Lighthouse desde Chrome DevTools o la extensión oficial de Lighthouse en la URL HTTPS. Revisa instalación, HTTPS, accesibilidad, rendimiento, manifiesto, iconos y funcionamiento offline. La categoría independiente **Progressive Web App** dejó de estar disponible en las versiones recientes de Lighthouse; algunas versiones/extensiones anteriores todavía la muestran. Por eso el objetivo de auditoría se debe reportar con la versión de Lighthouse utilizada y sus auditorías PWA disponibles, no prometer un 100% en una categoría que la herramienta ya no incluye. Lighthouse también cambia sus comprobaciones con el tiempo.

## Compatibilidad y limitaciones

Consulta la [matriz de compatibilidad y la lista de instalación](docs/arquitectura.md#compatibilidad-e-instalación) antes de las pruebas en dispositivos. En particular:

- Chrome en Android suele ofrecer el flujo de instalación más completo y puede mostrar su propio botón de instalación. El botón de la página aparece solamente cuando el navegador emite `beforeinstallprompt`.
- Safari en iOS no expone ese evento: instala manualmente con **Compartir → Añadir a pantalla de inicio**. En iOS no se debe depender de Background Sync; CampoListo sincroniza al abrirse, al volver a primer plano/conexión y al pulsar el botón.
- IndexedDB y cachés pueden ser eliminados por el usuario o por políticas de almacenamiento del navegador. La copia local no sustituye una copia de seguridad del servidor.

## Arquitectura y despliegue

La justificación comparativa, decisiones, configuración y limitaciones están en [docs/arquitectura.md](docs/arquitectura.md). El proyecto incluye [`render.yaml`](render.yaml) para desplegar el servidor Node en Render con un disco persistente montado en `/opt/render/project/src/data`; la URL pública se sirve con HTTPS gestionado por Render.

1. Sube el repositorio a GitHub.
2. En Render, crea un **Blueprint** y conecta ese repositorio; Render detectará `render.yaml`.
3. Espera a que termine el despliegue y abre la URL HTTPS. Confirma `/api/health`.
4. Prueba la instalación desde el teléfono y reporta que Safari requiere instalación manual.

El despliegue con archivo JSON está pensado para un prototipo y una sola instancia de servidor. No habilites varias instancias ni lo uses como almacenamiento empresarial compartido: escrituras concurrentes, disponibilidad y recuperación ante desastres requieren una base de datos gestionada y copias de seguridad. Antes de usar datos reales, agrega autenticación, autorización por técnico/empresa, transporte y retención de datos acordes con la política de privacidad, auditoría y protección de datos personales. No se implementa ni simula inicio de sesión.

## Estructura

```text
app.js                 Interfaz, IndexedDB y sincronización
server.mjs             Servidor estático y API REST sin dependencias
sw.js                  Ciclo de vida y caché offline del shell
manifest.webmanifest   Configuración de instalación PWA
icons/                 Iconos PWA SVG y PNG
docs/arquitectura.md    Reporte técnico y matriz de decisión
server.test.mjs         Pruebas unitarias de validación de API
render.yaml             Blueprint de despliegue HTTPS en Render
```
