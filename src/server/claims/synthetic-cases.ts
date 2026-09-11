export interface SyntheticCase {
  id: string;
  procedureId: string;
  narrative: string;
}

const scenarios: Array<[string, string[]]> = [
  ["ATM-001", ["Retiré B/.80.00 en un cajero y la cuenta fue debitada, pero no recibí efectivo.", "El cajero no entregó dinero aunque el débito aparece en mi cuenta.", "Mi retiro en ATM fue debitado y no salió efectivo.", "Saqué dinero del cajero, vi el débito, pero la máquina no entregó billetes.", "El cajero debitó mi cuenta y no entregó efectivo.", "Intenté retirar dinero, el débito figura, pero el cajero quedó vacío."]],
  ["TAR-002", ["No reconozco una compra con mi tarjeta de débito.", "Aparece un consumo con tarjeta que no realicé.", "Tengo un cargo desconocido en mi tarjeta.", "Mi tarjeta muestra una compra que no autoricé."]],
  ["TAR-003", ["El cajero retuvo mi tarjeta y no la devolvió.", "Mi tarjeta quedó atrapada en el cajero.", "El ATM se quedó con mi tarjeta.", "La máquina retuvo mi tarjeta durante un retiro."]],
  ["CTA-001", ["No reconozco un débito en mi cuenta de ahorro.", "Hay un movimiento de cuenta que no autoricé.", "Mi cuenta aparece debitada por una operación desconocida.", "Veo un débito que no hice en mi cuenta."]],
  ["CTA-002", ["El saldo disponible no coincide con lo que esperaba.", "Mi saldo cambió y no entiendo la diferencia.", "El saldo de mi cuenta no refleja el monto esperado.", "Hay una diferencia entre mi saldo esperado y el disponible."]],
  ["CTA-003", ["Mi cuenta de ahorro está restringida y no puedo usarla.", "No puedo operar porque mi cuenta aparece bloqueada.", "La cuenta quedó restringida.", "Intento usar mis fondos y la cuenta está limitada."]],
  ["TRF-001", ["Envié una transferencia y el destinatario no la recibió.", "La transferencia salió de mi cuenta, pero no llegó al beneficiario.", "Mi transferencia sigue sin llegar.", "El receptor no recibió la transferencia enviada."]],
  ["TRF-002", ["Una transferencia se procesó dos veces.", "Veo el mismo envío duplicado.", "Mi transferencia aparece repetida.", "Se debitó dos veces la misma transferencia."]],
  ["TRF-003", ["Envié una transferencia al beneficiario equivocado.", "Transferí fondos a otra persona por error.", "La transferencia fue enviada a un destinatario incorrecto.", "Necesito reportar un beneficiario equivocado."]],
  ["DIG-001", ["La banca digital muestra acceso bloqueado en mi celular.", "No puedo entrar a la aplicación de banca.", "Mi acceso digital está bloqueado.", "La app no me permite iniciar sesión."]],
  ["DIG-002", ["No recibí el código de verificación.", "El mensaje con el código nunca llegó.", "La banca digital no envía el código.", "Estoy esperando el código de acceso."]],
  ["DIG-003", ["Veo actividad digital que no reconozco.", "Hay un acceso extraño en mi banca en línea.", "No reconozco una operación hecha desde la app.", "Mi cuenta registra actividad digital desconocida."]]
];

export const syntheticCases: readonly SyntheticCase[] = scenarios.flatMap(([procedureId, narratives]) =>
  narratives.map((narrative, index) => ({ id: `${procedureId}-${String(index + 1).padStart(2, "0")}`, procedureId, narrative }))
);
