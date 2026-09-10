# CaseFlow AI

MVP local para que un colaborador bancario transforme un reclamo por texto o voz en un expediente revisable. Está construido desde cero para el desafío **Caja de Ahorros: Inteligencia local para la banca**.

La meta demostrable es reducir la preparación inicial de aproximadamente 15 minutos a menos de 2 minutos. CaseFlow no registra casos en un core bancario ni envía respuestas: un humano revisa y confirma el expediente antes de que se guarde localmente.

## Privacidad y alcance

- Toda inferencia se ejecuta en el proceso Node mediante `@qvac/sdk@0.19.0`; no hay proveedor de IA ni endpoint de inferencia cloud.
- Una vez descargados los modelos, puede demostrarse desconectando la red. La descarga/precarga ocurre con `npm run models:prepare` y se mide aparte del benchmark.
- El audio se convierte localmente a WAV mono 16 kHz para transcribirlo y luego se borra. Solo se guardan en SQLite los expedientes que el colaborador confirma.
- Los 12 procedimientos y los 16 casos de prueba son **sintéticos**. No contiene ni admite datos reales de clientes para la demo.
- La interfaz usa marca propia CaseFlow AI; no utiliza logotipos oficiales.

## Flujo

```text
Texto / voz → Parakeet (voz) → GTE Large + RAG local → Qwen + JSON Schema estructurado
                                                     ↓
                    procedimiento citado + área + faltantes + borrador → revisión humana → SQLite local
```

El módulo profundo es `createClaimPreparer(...)`, que expone la operación `prepareClaim(input, onProgress)` y encapsula transcripción, recuperación, inferencia, validación, temporales y errores. Sus estados observables son: `queued`, `transcribing`, `retrieving`, `analyzing`, `validating`, `ready` y `failed`. Qwen 600M usa `responseFormat: json_schema` de QVAC/llama.cpp para obtener una salida estructurada verificable; el intento real de tool call no fue fiable en este modelo, por lo que no se mantiene una herramienta falsa. La confianza se acepta como fracción 0–1 o porcentaje 0–100 y se normaliza determinísticamente a fracción.

La salida se valida con Zod. El procedimiento debe estar entre los tres recuperados y dentro del catálogo local; producto, categoría y área se toman exclusivamente del procedimiento canónico; los faltantes se calculan determinísticamente a partir de `requiredFields`. Una salida inválida falla sin fabricar valores y conserva la transcripción para revisión manual.

## Modelos QVAC

| Función | Modelo |
| --- | --- |
| Voz en español | `PARAKEET_TDT_0_6B_V3_Q8_0` |
| Recuperación RAG | `GTE_LARGE_FP16` |
| Extracción estructurada | `QWEN3_600M_INST_Q4` |
| Evaluado y descartado | `QWEN3_1_7B_INST_Q4`: superó 110 s en la Intel UHD de la demo |

QVAC y sus modelos se distribuyen bajo sus licencias respectivas; el SDK instalado declara Apache-2.0. Consultar las condiciones de cada modelo antes de uso productivo. La investigación concreta de integración está en [docs/research/qvac-sdk-0.19.md](docs/research/qvac-sdk-0.19.md).

## Requisitos de Windows

- Node.js 22.17+ (validado con Node 24).
- FFmpeg en `PATH`.
- Vulkan recomendado para aceleración local; el modo CPU depende de la capacidad detectada por QVAC.
- Espacio suficiente para las cachés de los modelos. No se versionan modelos ni cachés.

```powershell
npm install
npm run doctor
npm run models:prepare     # requiere Internet únicamente para la descarga inicial
npm run dev
```

Abrir la interfaz de Vite que se muestra en la terminal. Para empaquetar y ejecutar una sola instancia:

```powershell
npm run build
npm start
```

## Pruebas y benchmark

```powershell
npm test
npm run test:e2e
npm run typecheck
npm run build
npm run benchmark
```

El benchmark ejecuta 10 reclamos sintéticos con modelos ya precargados mediante `POST /api/runs` y polling hasta `ready`; genera `output/benchmark.json` (no versionado) y `docs/benchmark-latest.md`. La aceptación es `p95 < 120 s` desde el envío del texto o final de audio hasta `ready`; descarga y arranque frío quedan fuera de esa cifra. El modelo de 1.7B superó 110 s en la máquina de demo, por lo que el MVP queda fijado en 600M y se repite toda la batería; no hay selección dinámica durante la demo.

El recorrido de Playwright usa un adaptador determinista aislado en `scripts/e2e-server.ts`; el servidor de producción siempre usa `QvacRuntime`. En desarrollo local Playwright usa Chrome instalado si el navegador gestionado aún no se ha descargado.

## Caso estrella

El botón “Cargar caso estrella de cajero” selecciona `ATM-001`, recomienda **Operaciones de Cajeros y Disputas**, detecta `identificador_cajero` y `hora_aproximada` como faltantes y crea un borrador que no promete resolución.

## Limitaciones deliberadas del MVP

- El RAG integrado de QVAC es apropiado para prototipo; en producción se debe usar una base vectorial externa y gobierno documental.
- P2P/Pears, autenticación bancaria, cifrado administrado por el banco, integración con core bancario, gestión de permisos, auditoría regulatoria y datos reales quedan fuera de alcance.
- No se debe presentar un SLA sintético como compromiso real del banco.

## Entrega

No se utilizó una base preexistente: el proyecto fue creado desde cero. El guion para el video de menos de cinco minutos está en [docs/video-script.md](docs/video-script.md). La decisión de diseño de interfaz está en [docs/ui-decision.md](docs/ui-decision.md).
