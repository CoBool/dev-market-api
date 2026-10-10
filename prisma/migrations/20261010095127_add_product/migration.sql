-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "tags" TEXT[] NOT NULL,
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellerId" INTEGER NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_price_check" CHECK ("price" BETWEEN 0 AND 10000000),
    CONSTRAINT "Product_tags_check" CHECK (cardinality("tags") BETWEEN 1 AND 5),
    CONSTRAINT "Product_images_check" CHECK (cardinality("images") BETWEEN 0 AND 10)
);

-- CreateIndex
CREATE INDEX "Product_sellerId_id_idx" ON "Product"("sellerId", "id");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
