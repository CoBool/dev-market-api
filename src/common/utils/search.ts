/** LIKE 검색 시 특수문자를 이스케이프하여 안전한 패턴 생성 */
export const escapeLike = (keyword: string): string => {
  return keyword.replace(/[\\%_]/g, '\\$&');
};
