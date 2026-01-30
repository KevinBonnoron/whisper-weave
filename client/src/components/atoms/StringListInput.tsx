import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface StringListInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** Optional label above the list */
  label?: string;
  /** id for the label (for accessibility) */
  id?: string;
  placeholder?: string;
  /** Hint text below the list */
  hint?: string;
  /** Label for the "Add" button */
  addButtonLabel?: string;
  className?: string;
}

export function StringListInput({ value, onChange, label, id, placeholder, hint, addButtonLabel = 'Add', className }: StringListInputProps) {
  const handleChange = (index: number, newItem: string) => {
    const next = [...value];
    next[index] = newItem;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...value, '']);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label != null && (
        <Label htmlFor={id} className="block">
          {label}
        </Label>
      )}
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Input id={id != null ? `${id}-${index}` : undefined} value={item} onChange={(e) => handleChange(index, e.target.value)} placeholder={placeholder} className="font-mono text-sm flex-1 min-w-0" />
            <Button type="button" variant="outline" size="icon" className="shrink-0 size-9" onClick={() => handleRemove(index)} aria-label="Remove row">
              −
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
          {addButtonLabel}
        </Button>
      </div>
      {hint != null && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
