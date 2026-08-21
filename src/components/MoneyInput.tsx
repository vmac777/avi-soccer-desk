import { Input } from '@/components/ui/input';
import { digitsOnly, groupDigits, formatMoneyShort, parseMoney } from '@/lib/money';

/**
 * A money field you cannot silently mis-key by a factor of a million.
 *
 * The previous version put the unit in the label — "FEE CEILING (€M)" — and
 * took a bare number. That invites two readings and both got typed: a real
 * entry read `5000000`, meaning five million, and was stored as five trillion.
 * Every player on the roster came in under budget, all twenty-five scored the
 * same, and the shortlist was worthless without anything on screen looking
 * wrong.
 *
 * So: plain euros, digits grouped while typing, and the magnitude spelled out
 * underneath. Type five million and it says €5.0m. Type it wrong and it says
 * €5.0bn, which is not a number anyone gets to ignore.
 *
 * `type="text"` with a numeric inputMode rather than `type="number"`: browsers
 * refuse to render a grouped value in a number input, and the spinner arrows
 * are useless at this scale. Phones still get the number pad.
 */
export default function MoneyInput({
  value,
  onChange,
  placeholder = '—',
  suffix,
  id,
}: {
  /** Raw digits, no separators. Empty string means unset. */
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  /** e.g. "/yr" — appended to the magnitude hint. */
  suffix?: string;
  id?: string;
}) {
  const amount = parseMoney(value);

  return (
    <div>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={groupDigits(value)}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        placeholder={placeholder}
        className="h-8 text-xs font-mono"
      />
      {/* Reserve the line whether or not it has content, so the row does not
          jump as soon as somebody starts typing. */}
      <p className="mt-1 h-3 text-[10px] text-muted-foreground">
        {amount != null ? `${formatMoneyShort(amount)}${suffix ?? ''}` : ''}
      </p>
    </div>
  );
}
