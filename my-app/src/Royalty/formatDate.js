// One date rendering for RoyalTree labels and tooltips.
// {time, precision} and a tie follow royaltree.wdqs.format_date, including
// the year-0 rule: at precision 6-8, astronomical year 0 is the positive
// block (c. 1st millennium, c. 1st century, 0s). Year 0 is 1 BCE only at
// year precision and finer. Astronomical -43 at day precision is 44 BCE.
// A string carries no precision. It stays a year, including a 1 January
// timestamp. It is not read as a calendar day.

const MONTHS = [
  null, 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n) {
  let suffix = 'th';
  if (n % 100 < 10 || n % 100 > 20) {
    suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  }
  return `${n}${suffix}`;
}

function splitTime(time) {
  const match = /^([+-]?\d+)-(\d{2})-(\d{2})/.exec(String(time ?? ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function historicalYear(astro) {
  if (astro > 0) return [astro, false];
  return [1 - astro, true];
}

export function formatDate(when) {
  if (when == null || when === '') return '?';
  if (typeof when === 'string') {
    const parts = splitTime(when);
    if (!parts) return '?';
    return formatDate({ time: when, precision: 9 });
  }
  if (typeof when !== 'object') return '?';
  if (when.tie) {
    const values = Array.isArray(when.values) ? when.values : [];
    if (!values.length) return '?';
    return values.map((value) => formatDate(value)).join(' / ');
  }
  if (when.value && when.time == null) return formatDate(when.value);
  if (when.time == null || when.precision == null) return '?';
  const parts = splitTime(when.time);
  if (!parts) return '?';
  const [astro, month, day] = parts;
  const precision = Number(when.precision);
  if (precision >= 6 && precision <= 8) {
    const era = astro < 0 ? ' BCE' : '';
    const year = astro < 0 ? 1 - astro : astro;
    if (precision === 6) {
      const n = astro >= 0 ? Math.floor(astro / 1000) + 1 : Math.floor((year - 1) / 1000) + 1;
      return `c. ${ordinal(n)} millennium${era}`;
    }
    if (precision === 7) {
      const n = astro >= 0 ? Math.floor(astro / 100) + 1 : Math.floor((year - 1) / 100) + 1;
      return `c. ${ordinal(n)} century${era}`;
    }
    const base = astro >= 0 ? Math.floor(astro / 10) * 10 : Math.floor(year / 10) * 10;
    return `${base}s${era}`;
  }
  const [year, bce] = historicalYear(astro);
  const era = bce ? ' BCE' : '';
  if (precision <= 5) return `c. ${year}${era}`;
  if (precision >= 11 && month && day) return `${day} ${MONTHS[month]} ${year}${era}`;
  if (precision >= 10 && month) return `${MONTHS[month]} ${year}${era}`;
  return `${year}${era}`;
}
