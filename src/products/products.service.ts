import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { productArgs, type ProductWithSeller } from './products.select.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
