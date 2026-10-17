import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto.js';
import { CursorPaginated } from '../../common/interfaces/cursor-paginated.interface.js';
import {
  productCommentArgs,
  type ProductCommentWithWriter,
} from './product-comments.select.js';
import { CreateProductCommentDto } from './dto/create-product-comment.dto.js';

@Injectable()
export class ProductCommentsService {
  constructor(private readonly prisma: PrismaService) { }

  private async ensureProductExists(productId: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다.');
  }

  async findAll(
    productId: number,
    query: CursorPaginationQueryDto,
  ): Promise<CursorPaginated<ProductCommentWithWriter>> {
    await this.ensureProductExists(productId);

    const { cursor, limit } = query;

    const rows = await this.prisma.productComment.findMany({
      where: {
        productId,
        id: cursor ? { lt: cursor } : undefined,
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...productCommentArgs,
    });

    const hasNext = rows.length > limit;

    const items = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext ? (items.at(-1)?.id ?? null) : null;

    return { items, meta: { nextCursor } };
  }

  async create(
    productId: number,
    createProductCommentDto: CreateProductCommentDto,
    writerId: number,
  ): Promise<ProductCommentWithWriter> {
    await this.ensureProductExists(productId);

    const { content } = createProductCommentDto;

    return this.prisma.productComment.create({
      data: { content, productId, writerId },
      ...productCommentArgs,
    });
  }
}
