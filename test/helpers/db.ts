import { PrismaService } from '../../src/prisma/prisma.service.js';

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // 외래 키 참조를 제거하기 위해 댓글·좋아요 → 게시글·상품 → 사용자 순서로 삭제
  await prisma.articleComment.deleteMany();
  await prisma.articleLike.deleteMany();
  await prisma.productComment.deleteMany();
  await prisma.article.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
}
