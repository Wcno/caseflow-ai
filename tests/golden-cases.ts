export const goldenCases = [
  ["Retiro debitado y el cajero no entregó efectivo", "ATM-001"], ["No reconozco una compra con tarjeta", "TAR-002"], ["El cajero retuvo mi tarjeta", "TAR-003"],
  ["No reconozco un débito en mi cuenta de ahorro", "CTA-001"], ["Mi saldo disponible no coincide", "CTA-002"], ["Mi cuenta está restringida", "CTA-003"],
  ["Envié una transferencia y no la recibieron", "TRF-001"], ["Me cobraron la transferencia dos veces", "TRF-002"], ["Envié una transferencia al beneficiario incorrecto", "TRF-003"],
  ["La banca en línea dice acceso bloqueado", "DIG-001"], ["No recibo el código OTP por SMS", "DIG-002"], ["No reconozco un acceso desde otro dispositivo", "DIG-003"],
  ["Cajero debitó dinero pero no dispensó efectivo", "ATM-001"], ["Transferencia ACH no reflejada al destinatario", "TRF-001"], ["La aplicación no me deja iniciar sesión", "DIG-001"], ["Veo una diferencia de saldo en mi cuenta", "CTA-002"]
] as const;
