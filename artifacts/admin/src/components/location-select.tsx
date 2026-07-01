import { useMemo } from "react";
import { Country, State, City } from "country-state-city";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LocationSelectProps {
  country: string;       // ISO code, e.g. "IN"
  state: string;         // state full name, e.g. "Maharashtra"
  city: string;          // city name, e.g. "Mumbai"
  onCountryChange: (isoCode: string) => void;
  onStateChange: (name: string) => void;
  onCityChange: (name: string) => void;
}

export function LocationSelect({
  country,
  state,
  city,
  onCountryChange,
  onStateChange,
  onCityChange,
}: LocationSelectProps) {
  const countries = useMemo(() => Country.getAllCountries(), []);

  const states = useMemo(() => {
    if (!country) return [];
    return State.getStatesOfCountry(country);
  }, [country]);

  const stateIsoCode = useMemo(() => {
    if (!state || states.length === 0) return "";
    return states.find((s) => s.name === state)?.isoCode ?? "";
  }, [state, states]);

  const cities = useMemo(() => {
    if (!country || !stateIsoCode) return [];
    return City.getCitiesOfState(country, stateIsoCode);
  }, [country, stateIsoCode]);

  function handleCountryChange(iso: string) {
    onCountryChange(iso);
    onStateChange("");
    onCityChange("");
  }

  function handleStateChange(stateName: string) {
    onStateChange(stateName);
    onCityChange("");
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <Label>Country</Label>
        <Select value={country} onValueChange={handleCountryChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {countries.map((c) => (
              <SelectItem key={c.isoCode} value={c.isoCode}>
                {c.flag} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>State / Province</Label>
        <Select
          value={state}
          onValueChange={handleStateChange}
          disabled={!country || states.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={country ? "Select state" : "Select country first"} />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {states.map((s) => (
              <SelectItem key={s.isoCode} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>City</Label>
        <Select
          value={city}
          onValueChange={onCityChange}
          disabled={!stateIsoCode}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !state
                  ? "Select state first"
                  : cities.length === 0
                  ? "No cities listed"
                  : "Select city"
              }
            />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {cities.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
