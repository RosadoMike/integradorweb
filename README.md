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
- Persistencia local de demostración en `data/reports.json`; en Vercel, los endpoints serverless guardan y consultan Supabase.

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

## Despliegue gratuito en Vercel + Supabase

El proyecto usa funciones serverless en `api/` y Supabase como base de datos. Los planes gratuitos están sujetos a límites, suspensión por inactividad, cambios de precio y condiciones de cada proveedor; revisa sus páginas de precios. Vercel no conserva archivos escritos en el disco de sus funciones, así que `data/reports.json` solo funciona con el servidor local de demostración, no es la persistencia del despliegue.

1. Crea un proyecto en Supabase y abre **SQL Editor → New query**. Ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
2. En Supabase → **Project Settings → API Keys**, copia el **Project URL** y crea/copia una **Secret key** (`sb_secret_...`). Es secreta: nunca la pongas en `app.js`, en el manifiesto, ni en una variable pública `NEXT_PUBLIC_*`. El backend también acepta la clave legacy `service_role`.
3. Sube el proyecto a un repositorio de GitHub.
4. En Vercel, importa ese repositorio como proyecto. No se requiere comando de build ni framework; deja la raíz del proyecto como raíz y el directorio de salida vacío o por defecto.
5. En **Settings → Environment Variables**, agrega `SUPABASE_URL` y `SUPABASE_SECRET_KEY` para **Production**, **Preview** y **Development** según necesites. Si usas la clave legacy `service_role`, el nombre compatible es `SUPABASE_SERVICE_ROLE_KEY`. La clave solo se usa en las funciones del servidor.
6. Despliega o vuelve a desplegar después de añadir las variables.
7. Abre `https://TU-PROYECTO.vercel.app/api/health`; debe responder `{"status":"ok"}`. Luego abre la URL raíz, registra un reporte conectado y verifica `https://TU-PROYECTO.vercel.app/api/reports`.
8. Prueba desconectar el teléfono después de cargar la app, registrar un reporte y reconectar para verificar que se sincroniza.

Los cambios guardados en GitHub pueden iniciar nuevos despliegues automáticamente. No publiques `.env` ni claves en el repositorio. Si una clave se expone, revócala y genera otra en Supabase.

### Ejecutar localmente

```powershell
node --version
npm run dev
npm test
```

`npm run dev` inicia un servidor local Node con almacenamiento de demostración en `data/reports.json`; no conecta a Supabase. Para desarrollar contra funciones Vercel localmente, usa Vercel CLI (`vercel dev`) después de enlazar el proyecto y definir las variables de entorno localmente. Nunca compartas el archivo `.env.local`.

### Límites de seguridad del prototipo

Las rutas para crear y listar reportes no implementan autenticación: cualquier persona que conozca la URL pública puede intentar enviar reportes y consultar los existentes. Supabase Row Level Security está habilitado y las funciones usan una clave privilegiada del lado servidor, pero esto no autentica a los usuarios de la app. Usa únicamente datos ficticios para la demostración pública. Antes de trabajar con clientes reales, implementar inicio de sesión, autorización por usuario/empresa, controles antiabuso y una política de privacidad y retención adecuada.

La justificación comparativa y la matriz están en [docs/arquitectura.md](docs/arquitectura.md). Safari en iOS requiere instalación manual desde **Compartir → Añadir a pantalla de inicio**.

## Estructura

```text
app.js                 Interfaz, IndexedDB y sincronización
server.mjs             Servidor local para pruebas con JSON
api/                    Funciones serverless de Vercel
lib/supabase.mjs        Cliente REST de servidor para Supabase
supabase/schema.sql     Tabla e índices/checks de reportes
sw.js                  Ciclo de vida y caché offline del shell
manifest.webmanifest   Configuración de instalación PWA
icons/                 Iconos PWA SVG y PNG
docs/arquitectura.md    Reporte técnico y matriz de decisión
server.test.mjs         Pruebas unitarias de validación de API
```
