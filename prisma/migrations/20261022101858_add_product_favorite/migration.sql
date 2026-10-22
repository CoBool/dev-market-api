-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "favoriteCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProductFavorite" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "ProductFavorite_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateIndex
CREATE INDEX "ProductFavorite_productId_idx" ON "ProductFavorite"("productId");

-- CreateIndex
CREATE INDEX "Product_favoriteCount_id_idx" ON "Product"("favoriteCount", "id");

-- AddForeignKey
ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add check constraint to favoriteCount to ensure it's non-negative
ALTER TABLE "Product" ADD CONSTRAINT "Product_favoriteCount_check" CHECK ("favoriteCount" >= 0);
