# CaseFlow AI

## 1. Descripción

CaseFlow AI es un MVP local para colaboradores bancarios. Convierte un reclamo sintético, recibido por texto o voz, en un expediente revisable: transcripción, clasificación, producto, procedimiento, área responsable, faltantes, resumen y borrador de respuesta.

Está construido desde cero para el desafío **Caja de Ahorros: Inteligencia local para la banca**. Su meta demostrable es reducir la preparación inicial de aproximadamente 15 minutos a menos de 2 minutos.

El colaborador revisa y confirma el expediente antes de guardarlo. Los casos confirmados se almacenan únicamente en SQLite local; la aplicación no escribe en un core bancario ni envía respuestas.

```text
Texto / voz → transcripción local → procedimientos → análisis estructurado
           → faltantes + resumen + borrador → revisión humana → expediente local
```

El caso estrella es un retiro debitado sin entrega de efectivo: selecciona `ATM-001`, recomienda **Operaciones de Cajeros y Disputas**, detecta hora e identificador del cajero como faltantes y evita prometer resolución. Todos los datos son sintéticos y no se usan logotipos oficiales.

## 2. Rol de QVAC

Toda inferencia ocurre dentro del proceso Node mediante `@qvac/sdk@0.19.0`. No hay fallback de IA en la nube ni endpoint externo de inferencia.

| Etapa | Modelo QVAC | Función |
| --- | --- | --- |
| Voz | `PARAKEET_TDT_0_6B_V3_Q8_0` | Transcripción local en español |
| Recuperación | `GTE_LARGE_FP16` | RAG local de procedimientos sintéticos |
| Análisis | `QWEN3_600M_INST_Q4` | Extracción JSON, clasificación y borrador |

`createClaimPreparer(...)` expone `prepareClaim(input, onProgress)` y oculta transcripción, RAG, validación, temporales y errores. Zod valida la salida; procedimiento y área deben pertenecer al catálogo, y los faltantes se calculan desde `requiredFields`.

El Qwen 1.7B fue evaluado, pero superó 110 segundos en la Intel UHD de la demo. La entrega fija el 600M y añade reglas locales acotadas para casos inequívocos de cajero y relatos bancarios incompletos.

## 3. Valor generado

- Objetivo: pasar de 15 minutos de preparación a menos de 2.
- Menos casos enviados al área equivocada gracias al procedimiento citado.
- Borradores revisables en lugar de redacción manual repetitiva.
- Detección temprana de información faltante.
- Datos y audio procesados localmente, incluso con conectividad intermitente.

El repositorio incluye **50 casos sintéticos** distribuidos entre 12 procedimientos, 16 casos dorados de regresión y pruebas HTTP, de preparación y navegador.

## 4. Setup

### Requisitos

Windows, Node.js 22.17+ (validado con Node 24), FFmpeg en `PATH`, Vulkan recomendado y espacio para la caché de modelos.

### Instalación

```powershell
git clone https://github.com/Wcno/caseflow-ai.git
cd caseflow-ai
npm install
npm run doctor
npm run models:prepare   # precarga los modelos antes de la demo offline
npm run dev
```

Abre `http://127.0.0.1:5173/`; el backend local atiende en `http://127.0.0.1:8787/`.

Si aparece `File descriptor could not be locked`, cierra instancias anteriores, elimina los locks temporales de `.qvac` y vuelve a iniciar una sola instancia. Vite usa `strictPort` para no cambiar silenciosamente de puerto.

### Producción local y pruebas

```powershell
npm run build
npm start
npm run typecheck
npm test
npm run test:e2e
npm run benchmark
```

El benchmark genera `output/benchmark.json` y `docs/benchmark-latest.md`; la aceptación es `p95 < 120 s` desde el envío hasta `ready`. Descarga y arranque frío se reportan aparte.

### Privacidad y límites

El audio se convierte a WAV mono de 16 kHz, se transcribe y se elimina. Sólo se guardan expedientes confirmados en SQLite local. P2P/Pears, autenticación bancaria, cifrado institucional, permisos productivos, auditoría regulatoria, integración con core y datos reales quedan fuera del MVP. El RAG integrado es para prototipo; producción requiere gobierno documental y una base vectorial externa.

### Documentación

- [Arquitectura](docs/architecture.md)
- [Guion del video](docs/video-script.md)
- [Decisiones de interfaz](docs/ui-decision.md)
- [Investigación de QVAC](docs/research/qvac-sdk-0.19.md)

La propiedad intelectual permanece en el equipo. No se versionan modelos, cachés, expedientes ni secretos.
