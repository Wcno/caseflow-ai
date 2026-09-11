import type { Specialist } from "../../shared/contracts.js";

export const specialists: readonly Specialist[] = [
  { id: "esp-atm-01", name: "Carlos Méndez", area: "Operaciones de Cajeros y Disputas" },
  { id: "esp-fraude-01", name: "Sofía Castillo", area: "Prevención de Fraude y Disputas" },
  { id: "esp-tarjetas-01", name: "Luis Herrera", area: "Operaciones de Tarjetas" },
  { id: "esp-cuentas-01", name: "Elena Rodríguez", area: "Operaciones de Cuentas" },
  { id: "esp-servicios-01", name: "Mateo Gómez", area: "Servicios de Cuentas" },
  { id: "esp-pagos-01", name: "Valeria Núñez", area: "Pagos y Transferencias" },
  { id: "esp-digital-01", name: "Diego Santos", area: "Soporte de Canales Digitales" },
  { id: "esp-seguridad-01", name: "Camila Ortega", area: "Seguridad Digital" }
] as const;
