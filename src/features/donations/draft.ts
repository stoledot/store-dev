import { currencyDecimals } from '../../money';

export interface DonationDraft {
  currency: string;
  oneTimeAmounts: string;
  monthlyAmounts: string;
  terms: string;
  refundPolicy: string;
  privacyNotice: string;
}

export const defaultDonationDraft: DonationDraft = {
  currency: '',
  oneTimeAmounts: '',
  monthlyAmounts: '',
  terms: 'La aportación es voluntaria y apoya la continuidad del proyecto. Responsable: [NOMBRE Y DATOS DE CONTACTO]. Las aportaciones mensuales se cobrarán automáticamente hasta su cancelación. Antes de pagar se mostrará el importe y la frecuencia. No se ofrece comprobante fiscal deducible. Revisa y adapta estas condiciones con asesoría legal antes de habilitar los cobros.',
  refundPolicy: 'Para consultas sobre un cargo o una solicitud de devolución, contacta a [CORREO DE SOPORTE]. Indica el correo de tu cuenta y los datos del cargo. Las solicitudes se atenderán conforme a la legislación aplicable.',
  privacyNotice: 'Responsable: [NOMBRE Y DOMICILIO]. Los datos de cuenta y transacción se usarán para gestionar las aportaciones, procesar pagos con Stripe, atender solicitudes y cumplir obligaciones legales. Consulta el aviso integral en [URL DEL AVISO] y ejerce tus derechos ARCO mediante [CONTACTO]. Completa y revisa el aviso antes de habilitar los cobros.',
};

export function parseDonationAmounts(input: string, currency: string): number[] {
  const entries = input.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (entries.length > 20) throw new Error('Puedes introducir hasta 20 montos por modalidad.');
  const decimals = currencyDecimals(currency);
  const amounts = entries.map((entry) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(entry);
    if (!match || (match[2]?.length ?? 0) > decimals) {
      throw new Error(`Escribe un monto válido por línea, con hasta ${decimals} decimales.`);
    }
    const minor = Number(match[1]) * 10 ** decimals + Number((match[2] ?? '').padEnd(decimals, '0') || 0);
    if (!Number.isSafeInteger(minor) || minor < 1 || minor > 100_000_000) {
      throw new Error('Cada monto debe ser mayor que cero y no superar el límite permitido.');
    }
    return minor;
  });
  if (new Set(amounts).size !== amounts.length) throw new Error('No repitas montos en la misma modalidad.');
  return amounts;
}

export function readDonationDraft(raw: string | null): DonationDraft {
  if (raw === null) return { ...defaultDonationDraft };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('El borrador de donaciones no es válido.');
  const draft = value as Record<string, unknown>;
  const keys = ['currency', 'oneTimeAmounts', 'monthlyAmounts', 'terms', 'refundPolicy', 'privacyNotice'] as const;
  if (keys.some((key) => typeof draft[key] !== 'string')) throw new Error('El borrador de donaciones está incompleto.');
  return {
    currency: String(draft.currency),
    oneTimeAmounts: String(draft.oneTimeAmounts),
    monthlyAmounts: String(draft.monthlyAmounts),
    terms: String(draft.terms),
    refundPolicy: String(draft.refundPolicy),
    privacyNotice: String(draft.privacyNotice),
  };
}
