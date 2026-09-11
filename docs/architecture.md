# Arquitectura de CaseFlow AI

## Módulos y seams

```text
src/client      Interfaz React, navegación y edición humana
src/server      Composición HTTP y adaptadores locales
  claims/       Preparación profunda del reclamo y catálogo sintético
  qvac/         Adaptador QVAC para inferencia, RAG y transcripción
  cases/        Ciclo de vida del expediente operativo
  storage/      Persistencia SQLite local
src/shared      Contratos Zod compartidos entre cliente y servidor
tests/          Pruebas por seam público
scripts/        Diagnóstico, modelos y benchmark reproducibles
```

La entrada pública del dominio de reclamos es `src/server/claims/index.ts`.
Los callers no necesitan conocer la implementación de QVAC: reciben un
`PrepareClaim` y sus dependencias (`InferenceGateway`, `ProcedureRetriever`)
en el seam de preparación.

La interfaz HTTP vive en `buildApp(...)`; los tests la ejercitan con un
adaptador de inferencia determinista. `QvacRuntime` es el único adaptador que
conoce el SDK, sus modelos, la caché y el workspace RAG.

Las carpetas `data/`, `dist/`, `output/` y las cachés de QVAC son artefactos
locales y no forman parte del código fuente versionado.
