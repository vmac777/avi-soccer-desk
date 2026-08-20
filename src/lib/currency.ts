export const EUR_TO_BRL = 6.0;
export const USD_TO_BRL = 5.5;

function formatNumber(value: number, prefix: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${prefix}${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  return `${prefix}${value.toLocaleString('en-US')}`;
}

export function formatCurrency(brlAmount: number | null | undefined): string {
  if (brlAmount == null || brlAmount === 0) return '—';
  const eur = Math.round(brlAmount / EUR_TO_BRL);
  return `€${formatNumber(eur, '').trim()} (R$${formatNumber(brlAmount, '').trim()})`;
}

export function formatCurrencyEurOnly(brlAmount: number | null | undefined): string {
  if (brlAmount == null || brlAmount === 0) return '—';
  const eur = Math.round(brlAmount / EUR_TO_BRL);
  return `€${formatNumber(eur, '').trim()}`;
}

export function formatSalaryEur(brlAmount: number | null | undefined): string {
  if (brlAmount == null || brlAmount === 0) return '—';
  const eur = Math.round(brlAmount / EUR_TO_BRL);
  return `€${eur.toLocaleString('en-US')}`;
}

export function formatCompactEur(eurAmount: number | null | undefined): string {
  if (eurAmount == null || eurAmount === 0) return '—';
  const abs = Math.abs(eurAmount);
  const sign = eurAmount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    const val = (abs / 1_000_000_000).toFixed(1);
    return `${sign}€${val.endsWith('.0') ? val.slice(0, -2) : val}B`;
  }
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1);
    return `${sign}€${val.endsWith('.0') ? val.slice(0, -2) : val}M`;
  }
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`;
  return `${sign}€${abs}`;
}
