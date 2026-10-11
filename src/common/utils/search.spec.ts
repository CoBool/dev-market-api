import { escapeLike } from './search.js';

describe('escapeLike', () => {
  it.each([
    ['빈 문자열', '', ''],
    ['일반 검색어', 'keyboard', 'keyboard'],
    ['한글과 공백', '중고 키보드', '중고 키보드'],
    ['LIKE 와 무관한 특수문자', "a'b.*?[]()!", "a'b.*?[]()!"],
  ])('%s는 그대로 반환한다', (_name, keyword, expected) => {
    expect(escapeLike(keyword)).toBe(expected);
  });

  it.each([
    ['퍼센트', '100%', '100\\%'],
    ['밑줄', 'user_name', 'user\\_name'],
    ['역슬래시', 'path\\file', 'path\\\\file'],
    ['반복된 퍼센트', '%%', '\\%\\%'],
    ['반복된 밑줄', '__', '\\_\\_'],
    ['반복된 역슬래시', '\\\\', '\\\\\\\\'],
    ['앞뒤 와일드카드', '%keyboard_', '\\%keyboard\\_'],
    ['혼합된 특수문자', '할인 100%_\\상품', '할인 100\\%\\_\\\\상품'],
    ['이미 역슬래시가 있는 와일드카드', '\\%\\_', '\\\\\\%\\\\\\_'],
  ])('%s의 모든 LIKE 특수문자를 이스케이프한다', (_name, keyword, expected) => {
    expect(escapeLike(keyword)).toBe(expected);
  });
});
