import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@archidea-ai/mermaid-diagram-sequence';
import { themes } from '../themes';
import type { Theme } from '../themes';

export interface ThemeSelectorProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <div className="app-chrome app__row" style={{ margin: 0, gap: 8 }}>
      <span className="app__label" id="diagram-theme-label">
        Diagram theme
      </span>
      <Select
        value={value.id}
        onValueChange={(next: string | null) => {
          const picked = themes.find((theme) => theme.id === next);
          if (picked) onChange(picked);
        }}
      >
        {/*
          A theme is state, so the trigger shows the one in force. SelectValue
          renders the raw value by default, which is an id — the label is what a
          reader recognises.
        */}
        <SelectTrigger aria-labelledby="diagram-theme-label" className="min-w-36">
          <SelectValue>{value.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {themes.map((theme) => (
            <SelectItem key={theme.id} value={theme.id}>
              {theme.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
