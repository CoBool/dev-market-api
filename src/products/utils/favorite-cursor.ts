import { BadRequestException } from '@nestjs/common';
import { INT32_MAX } from '../../common/constants/limits.js';

type Cursor = {
  createdAt: Date;
  productId: number;
};

export function encodeFavoriteCursor(cursor: Cursor): string {
  const payload = [cursor.createdAt.getTime(), cursor.productId];
  const json = JSON.stringify(payload);

  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeFavoriteCursor(value: string): Cursor {
  const invalidCursor = () =>
    new BadRequestException('유효하지 않은 커서입니다.');

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidCursor();
  }

  const decoded = Buffer.from(value, 'base64url');

  if (decoded.toString('base64url') !== value) {
    throw invalidCursor();
  }

  let payload: unknown;

  try {
    payload = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (!Array.isArray(payload) || payload.length !== 2) {
    throw invalidCursor();
  }

  const [timestamp, productId] = payload;

  if (
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 253_402_300_799_999
  )
    throw invalidCursor();

  const createdAt = new Date(timestamp);

  if (Number.isNaN(createdAt.getTime())) throw invalidCursor();

  if (
    typeof productId !== 'number' ||
    !Number.isSafeInteger(productId) ||
    productId < 1 ||
    productId > INT32_MAX
  )
    throw invalidCursor();

  return { createdAt, productId };
}
