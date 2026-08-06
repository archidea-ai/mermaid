import { themes } from '../themes';
import type { Theme } from '../themes';

export interface ThemeSelectorProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <label className="app__row" style={{ margin: 0, gap: 8 }}>
      <span className="app__label">Diagram theme</span>
      <select
        className="app__select"
        value={value.id}
        onChange={(event) =>
          onChange(themes.find((theme) => theme.id === event.target.value) ?? themes[0]!)
        }
      >
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label}
          </option>
        ))}
      </select>
    </label>
  );
}
