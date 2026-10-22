import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import {
  productArgs,
  productListArgs,
  type ProductWithSeller,
  type ProductListItem,
} from './products.select.js';
import type {
  FindProductsQueryDto,
  ProductOrderBy,
} from './dto/find-products-query.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import { escapeLike } from '../common/utils/search.js';
import { buildPageMeta, getSkipTake } from '../common/utils/pagination.js';
import type { Paginated } from '../common/interfaces/paginated.interface.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

const PRODUCT_ORDER_BY = {
  recent: [{ id: 'desc' }],
  favorite: [{ favoriteCount: 'desc' }, { id: 'desc' }],
} satisfies Record<ProductOrderBy, Prisma.ProductOrderByWithRelationInput[]>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOwnedProduct(
    id: number,
    userId: number,
    action: '수정' | '삭제',
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { sellerId: true },
    });

    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다.');
    if (product.sellerId !== userId) {
      throw new ForbiddenException(`판매자만 ${action}할 수 있습니다.`);
    }
  }

  async findAll(
    query: FindProductsQueryDto,
  ): Promise<Paginated<ProductListItem>> {
    const where = this.buildSearchWhere(query.keyword);

    const totalCount = await this.prisma.product.count({ where });
    const meta = buildPageMeta(query, totalCount);

    if (query.page > meta.totalPages) {
      return { items: [], meta };
    }

    const { skip, take } = getSkipTake(query);

    const items = await this.prisma.product.findMany({
      where,
      orderBy: PRODUCT_ORDER_BY[query.orderBy],
      skip,
      take,
      ...productListArgs,
    });

    return { items, meta };
  }

  async findOne(id: number): Promise<ProductWithSeller> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      ...productArgs,
    });

    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다.');

    return product;
  }

  async create(
    createProductDto: CreateProductDto,
    sellerId: number,
  ): Promise<ProductWithSeller> {
    const { name, description, price, tags } = createProductDto;

    return this.prisma.product.create({
      data: { name, description, price, tags, sellerId },
      ...productArgs,
    });
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
    userId: number,
  ): Promise<ProductWithSeller> {
    if (!updateProductDto || Object.keys(updateProductDto).length === 0) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }

    await this.findOwnedProduct(id, userId, '수정');

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      ...productArgs,
    });
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findOwnedProduct(id, userId, '삭제');

    await this.prisma.product.delete({
      where: { id },
    });
  }

  private buildSearchWhere(
    keyword: string | undefined,
  ): Prisma.ProductWhereInput {
    if (!keyword) return {};

    const escaped = escapeLike(keyword);

    return {
      OR: [
        { name: { contains: escaped, mode: 'insensitive' } },
        { description: { contains: escaped, mode: 'insensitive' } },
      ],
    };
  }
}
