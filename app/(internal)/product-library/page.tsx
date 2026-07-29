import { requireInternal } from "@/lib/permissions";
import { ProductLibrary } from "@/components/product-library/ProductLibrary";

export default async function ProductLibraryPage() {
  await requireInternal();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Product Library</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Browse products and supplier details including pricing and timelines
        </p>
      </div>
      <ProductLibrary />
    </div>
  );
}
