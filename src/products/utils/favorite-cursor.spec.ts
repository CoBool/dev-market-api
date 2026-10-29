import { BadRequestException } from '@nestjs/common';
import { INT32_MAX } from '../../common/constants/limits.js';
import {
  decodeFavoriteCursor,
  encodeFavoriteCursor,
} from './favorite-cursor.js';

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('favorite cursor', () => {
  it('시각과 상품 ID를 Base64URL 배열로 인코딩하고 복원한다', () => {
    const cursor = {
      createdAt: new Date('2026-10-27T10:04:00.000Z'),
      productId: 20,
    };

    const encoded = encodeFavoriteCursor(cursor);

    expect(encoded).toBe('WzE3OTMwOTU0NDAwMDAsMjBd');
    expect(decodeFavoriteCursor(encoded)).toEqual(cursor);
  });

  it('최대 상품 ID도 복원한다', () => {
    const cursor = { createdAt: new Date(0), productId: INT32_MAX };

    expect(decodeFavoriteCursor(encodeFavoriteCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['빈 문자열', ''],
    ['허용되지 않은 문자', 'a!!b'],
    ['패딩이 포함된 Base64URL', 'WzAsMV0='],
    ['정규 형태가 아닌 Base64URL', 'WzAsMV1'],
    ['JSON이 아닌 내용', Buffer.from('invalid JSON').toString('base64url')],
  ])('%s을 거부한다', (_name, value) => {
    expect(() => decodeFavoriteCursor(value)).toThrow(BadRequestException);
  });

  it.each([
    ['배열이 아닌 값', { timestamp: 0, productId: 1 }],
    ['null', null],
    ['값이 하나인 배열', [0]],
    ['값이 세 개인 배열', [0, 1, 2]],
    ['문자열 시각', ['0', 1]],
    ['소수 시각', [1.5, 1]],
    ['안전한 정수 범위를 벗어난 시각', [Number.MAX_SAFE_INTEGER + 1, 1]],
    ['Date 범위를 벗어난 시각', [8_640_000_000_000_001, 1]],
    ['문자열 상품 ID', [0, '1']],
    ['0인 상품 ID', [0, 0]],
    ['음수 상품 ID', [0, -1]],
    ['소수 상품 ID', [0, 1.5]],
    ['INT32_MAX를 초과한 상품 ID', [0, INT32_MAX + 1]],
  ])('%s을 거부한다', (_name, payload) => {
    expect(() => decodeFavoriteCursor(encodePayload(payload))).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['시각 0', 0],
    ['시각 253402300799999', 253_402_300_799_999],
  ])('%s을 허용한다', (_name, timestamp) => {
    expect(decodeFavoriteCursor(encodePayload([timestamp, 1]))).toEqual({
      createdAt: new Date(timestamp),
      productId: 1,
    });
  });

  it.each([
    ['시각 -1', -1],
    ['시각 253402300800000', 253_402_300_800_000],
  ])('%s을 거부한다', (_name, timestamp) => {
    expect(() => decodeFavoriteCursor(encodePayload([timestamp, 1]))).toThrow(
      BadRequestException,
    );
  });
});
