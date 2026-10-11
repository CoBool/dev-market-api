export const normalizeTags = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) return value;

  const normalized = value.map((item: unknown) =>
    typeof item === 'string' ? item.trim().toLowerCase() : item,
  );

  return [...new Set(normalized)];
};
