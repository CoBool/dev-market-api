export const toPositiveInt = ({ value }: { value: unknown }) => {
  if (value === undefined) return value; // 선택 값이 없을 때는 그대로 (IsOptional이 처리)
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    ? Number(value)
    : NaN;
};
