import { getCategoryProducts } from "@/app/actions";
import {
  ProductsSkeleton,
  GridProducts,
  ProductItem,
} from "@/components/products";
import { type ProductCategory } from "@/schemas";
import { Suspense } from "react";

interface Props {
  params: Promise<{
    category: string;
  }>;
}

export async function generateMetadata({ params }: Props) {
  const capitalizeFirstLetter = (string: string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const { category } = await params;
  const capitalizedCategory = capitalizeFirstLetter(category);

  return {
    title: `${capitalizedCategory} | InveztIN`,
    description: `Browse ${capitalizedCategory} products on InveztIN.`,
  };
}

const CategoryPage = async ({ params }: Props) => {
  const { category } = await params;
  return (
    <section className="pt-14">
      <Suspense fallback={<ProductsSkeleton items={6} />}>
        <CategoryProducts category={category} />
      </Suspense>
    </section>
  );
};

const CategoryProducts = async ({
  category,
}: {
  category: ProductCategory;
}) => {
  const products = await getCategoryProducts(category);

  return (
    <GridProducts>
      {products.map((product: any) => (
        <ProductItem key={product.id} product={product} />
      ))}
    </GridProducts>
  );
};

export default CategoryPage;
