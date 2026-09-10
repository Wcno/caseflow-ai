import type { Product } from "../../shared/contracts.js";

export interface Procedure {
  id: string;
  product: Product;
  category: string;
  title: string;
  responsibleArea: string;
  requiredFields: readonly string[];
  steps: readonly string[];
  illustrativeSla: string;
  responseGuidance: string;
  searchText: string;
}

export const procedures: readonly Procedure[] = [
  {
    id: "ATM-001",
    product: "tarjeta_debito",
    category: "retiro_atm_efectivo_no_entregado",
    title: "Retiro debitado sin entrega de efectivo",
    responsibleArea: "Operaciones de Cajeros y Disputas",
    requiredFields: ["amount", "date", "location", "identificador_cajero", "hora_aproximada"],
    steps: [
      "Validar que el débito figure en la cuenta.",
      "Identificar el cajero, fecha, hora y monto reclamado.",
      "Remitir a conciliación del cajero sin prometer un resultado."
    ],
    illustrativeSla: "Hasta 10 días hábiles (dato sintético)",
    responseGuidance: "Confirmar recepción y solicitar únicamente los datos faltantes.",
    searchText: "cajero ATM retiro débito efectivo no entregado no dispensó dinero"
  },
  {
    id: "TAR-002",
    product: "tarjeta_debito",
    category: "cargo_no_reconocido",
    title: "Cargo con tarjeta no reconocido",
    responsibleArea: "Prevención de Fraude y Disputas",
    requiredFields: ["amount", "date", "merchant", "lastFourDigits"],
    steps: ["Verificar el movimiento reportado.", "Registrar comercio, fecha y monto.", "Escalar para análisis de disputa."],
    illustrativeSla: "Hasta 15 días hábiles (dato sintético)",
    responseGuidance: "No afirmar fraude; indicar que el movimiento será revisado.",
    searchText: "tarjeta compra cargo consumo comercio movimiento no reconocido fraude"
  },
  {
    id: "TAR-003",
    product: "tarjeta_debito",
    category: "tarjeta_retenida",
    title: "Tarjeta retenida por un cajero",
    responsibleArea: "Operaciones de Tarjetas",
    requiredFields: ["date", "location", "identificador_cajero", "lastFourDigits"],
    steps: ["Identificar el cajero.", "Validar el estado de la tarjeta.", "Orientar sobre reemplazo o recuperación."],
    illustrativeSla: "Atención inicial inmediata (dato sintético)",
    responseGuidance: "Priorizar medidas preventivas sin solicitar credenciales.",
    searchText: "cajero retuvo tragó tarjeta débito recuperación reemplazo"
  },
  {
    id: "CTA-001",
    product: "cuenta_ahorro",
    category: "debito_no_reconocido",
    title: "Débito de cuenta no reconocido",
    responsibleArea: "Operaciones de Cuentas",
    requiredFields: ["amount", "date", "reference"],
    steps: ["Identificar el débito.", "Comparar referencia y fecha.", "Escalar la investigación del movimiento."],
    illustrativeSla: "Hasta 10 días hábiles (dato sintético)",
    responseGuidance: "No atribuir responsabilidad antes de la investigación.",
    searchText: "cuenta ahorro débito descuento movimiento no reconocido"
  },
  {
    id: "CTA-002",
    product: "cuenta_ahorro",
    category: "diferencia_saldo",
    title: "Diferencia en el saldo disponible",
    responsibleArea: "Operaciones de Cuentas",
    requiredFields: ["date", "expectedBalance", "observedBalance"],
    steps: ["Recopilar saldos esperado y observado.", "Revisar movimientos pendientes.", "Escalar si la diferencia persiste."],
    illustrativeSla: "Hasta 5 días hábiles (dato sintético)",
    responseGuidance: "Explicar que el saldo será conciliado.",
    searchText: "cuenta saldo incorrecto diferencia dinero faltante disponible"
  },
  {
    id: "CTA-003",
    product: "cuenta_ahorro",
    category: "cuenta_restringida",
    title: "Cuenta de ahorro restringida",
    responsibleArea: "Servicios de Cuentas",
    requiredFields: ["date", "observedMessage", "lastSuccessfulOperation"],
    steps: ["Registrar el mensaje mostrado.", "Validar el canal afectado.", "Remitir para revisión de la restricción."],
    illustrativeSla: "Hasta 2 días hábiles (dato sintético)",
    responseGuidance: "No asegurar el levantamiento de la restricción.",
    searchText: "cuenta bloqueada restringida congelada no permite usar fondos"
  },
  {
    id: "TRF-001",
    product: "transferencia",
    category: "transferencia_no_recibida",
    title: "Transferencia enviada y no recibida",
    responsibleArea: "Pagos y Transferencias",
    requiredFields: ["amount", "date", "reference", "destinationBank"],
    steps: ["Validar la salida de fondos.", "Registrar referencia y banco destino.", "Rastrear el estado de la transferencia."],
    illustrativeSla: "Hasta 3 días hábiles (dato sintético)",
    responseGuidance: "Indicar que se verificará el estado sin garantizar acreditación.",
    searchText: "transferencia enviada destinatario no recibió no reflejada ACH"
  },
  {
    id: "TRF-002",
    product: "transferencia",
    category: "transferencia_duplicada",
    title: "Transferencia procesada dos veces",
    responsibleArea: "Pagos y Transferencias",
    requiredFields: ["amount", "date", "reference", "duplicateReference"],
    steps: ["Comparar ambas referencias.", "Confirmar cargos duplicados.", "Escalar la conciliación."],
    illustrativeSla: "Hasta 5 días hábiles (dato sintético)",
    responseGuidance: "No prometer reverso hasta completar la conciliación.",
    searchText: "transferencia duplicada doble cobro repetida dos veces"
  },
  {
    id: "TRF-003",
    product: "transferencia",
    category: "beneficiario_incorrecto",
    title: "Transferencia enviada a beneficiario incorrecto",
    responsibleArea: "Pagos y Transferencias",
    requiredFields: ["amount", "date", "reference", "destinationBank"],
    steps: ["Registrar la referencia.", "Determinar el estado de liquidación.", "Escalar solicitud de recuperación."],
    illustrativeSla: "Sin plazo garantizado (dato sintético)",
    responseGuidance: "Aclarar que la recuperación depende del estado de la operación.",
    searchText: "transferencia beneficiario equivocado cuenta incorrecta error destino"
  },
  {
    id: "DIG-001",
    product: "banca_digital",
    category: "acceso_bloqueado",
    title: "Acceso bloqueado a banca digital",
    responsibleArea: "Soporte de Canales Digitales",
    requiredFields: ["date", "observedMessage", "deviceType"],
    steps: ["Registrar mensaje y dispositivo.", "Validar identidad por el proceso autorizado.", "Orientar recuperación de acceso."],
    illustrativeSla: "Atención inicial inmediata (dato sintético)",
    responseGuidance: "Nunca solicitar contraseña, PIN ni código de un solo uso.",
    searchText: "banca en línea app acceso bloqueado contraseña usuario iniciar sesión"
  },
  {
    id: "DIG-002",
    product: "banca_digital",
    category: "codigo_otp_no_recibido",
    title: "Código de verificación no recibido",
    responsibleArea: "Soporte de Canales Digitales",
    requiredFields: ["date", "channel", "deviceType"],
    steps: ["Identificar el canal de entrega.", "Confirmar que el número registrado esté vigente sin exponerlo.", "Escalar si persiste."],
    illustrativeSla: "Hasta 1 día hábil (dato sintético)",
    responseGuidance: "Nunca pedir que el cliente comparta un OTP.",
    searchText: "OTP código verificación token SMS correo no llega"
  },
  {
    id: "DIG-003",
    product: "banca_digital",
    category: "acceso_digital_no_reconocido",
    title: "Actividad digital no reconocida",
    responsibleArea: "Seguridad Digital",
    requiredFields: ["date", "observedMessage", "deviceType"],
    steps: ["Registrar la actividad observada.", "Aplicar medidas preventivas autorizadas.", "Escalar a seguridad digital."],
    illustrativeSla: "Atención prioritaria (dato sintético)",
    responseGuidance: "Evitar conclusiones y no solicitar credenciales.",
    searchText: "inicio sesión dispositivo acceso actividad digital no reconocida seguridad"
  }
] as const;

export function procedureToDocument(procedure: Procedure): string {
  return [
    `ID: ${procedure.id}`,
    `Producto: ${procedure.product}`,
    `Categoría: ${procedure.category}`,
    `Título: ${procedure.title}`,
    `Área responsable: ${procedure.responsibleArea}`,
    `Datos requeridos: ${procedure.requiredFields.join(", ")}`,
    `Pasos: ${procedure.steps.join(" ")}`,
    `Plazo ilustrativo: ${procedure.illustrativeSla}`,
    `Guía de respuesta: ${procedure.responseGuidance}`,
    `Términos relacionados: ${procedure.searchText}`
  ].join("\n");
}

