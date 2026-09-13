import { useMemo, useState } from 'react';
import type { Country } from '../lib/countryCodes';
import { COUNTRIES } from '../lib/countryCodes';

type CountryCodeSelectProps = {
  value: Country;
  onChange: (country: Country) => void;
};

export default function CountryCodeSelect({ value, onChange }: CountryCodeSelectProps) {
  const [query, setQuery] = useState('');
  const filteredCountries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COUNTRIES;
    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(normalized) ||
        country.code.toLowerCase().includes(normalized) ||
        country.dial.includes(normalized)
    );
  }, [query]);

  return (
    <div className="country-code-select">
      <label htmlFor="country-code-search">Country code</label>
      <input
        id="country-code-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search country or dial code"
        className="w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-transparent px-4 py-3"
        autoComplete="off"
      />
      <select
        value={value.code}
        onChange={(event) => {
          const country = COUNTRIES.find((item) => item.code === event.target.value);
          if (country) onChange(country);
        }}
        aria-label="Select country code"
        className="mt-2 w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-[#0a1a3a] px-4 py-3 text-[color:var(--color-gold)]"
      >
        {filteredCountries.length === 0 ? (
          <option value={value.code}>
            {value.flag} {value.name} ({value.dial})
          </option>
        ) : (
          filteredCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.name} ({country.dial})
            </option>
          ))
        )}
      </select>
    </div>
  );
}
