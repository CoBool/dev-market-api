-- CreateIndex
CREATE INDEX "ProductFavorite_userId_createdAt_productId_idx" ON "ProductFavorite"("userId", "createdAt", "productId");
