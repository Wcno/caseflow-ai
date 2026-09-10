# Investigación de integración QVAC 0.19.0

Fecha: 9 de septiembre de 2026. Esta nota se basa en la versión instalada `@qvac/sdk@0.19.0` y en sus declaraciones TypeScript locales.

- `loadModel` admite descriptores del catálogo y entrega un modelo local cargado.
- Los descriptores usados son `PARAKEET_TDT_0_6B_V3_Q8_0`, `GTE_LARGE_FP16`, `QWEN3_1_7B_INST_Q4` y, solo como contingencia declarada, `QWEN3_600M_INST_Q4`.
- `transcribe` acepta una ruta local. CaseFlow convierte el audio a WAV mono 16 kHz antes de llamarlo.
- `ragIngest` y `ragSearch` usan el almacén integrado. La propia API lo etiqueta como prototipo y recomienda un vector DB externo para producción.
- `completion` admite herramientas y `responseFormat: json_schema`. En el equipo de demo, Qwen 600M no emitió una herramienta, por lo que CaseFlow usa el esquema JSON nativo de llama.cpp: fuerza el objeto, se valida con Zod y se rechaza cualquier procedimiento fuera del catálogo recuperado. Es una adaptación verificada, no una ruta cloud ni un fallback inventado.

Fuentes primarias: [SDK JS/TS](https://docs.qvac.tether.io/js-ts-sdk/), [transcripción](https://docs.qvac.tether.io/ai-capabilities/transcription/), [RAG](https://docs.qvac.tether.io/ai-capabilities/rag/), [requisitos del sistema](https://docs.qvac.tether.io/system-requirements/).
