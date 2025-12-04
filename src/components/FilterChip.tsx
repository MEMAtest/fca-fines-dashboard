interface FilterChipProps {
  label: string;
  onRemove?: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="filter-chip">
      {label}
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
