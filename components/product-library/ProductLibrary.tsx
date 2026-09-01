"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";

type Product = {
  styleCode: string;
  product: string;
};

type Supplier = {
  id: number;
  styleCode: string;
  product: string;
  supplierName: string;
  salesRep: string | null;
  email: string | null;
  currentSupplier: boolean;
  standardShippingMoq: string | null;
  economyShippingMoq: string | null;
  v4BlankSeaPrice: string | null;
  v4BlanksAirPrice: string | null;
  airShipPrice: string | null;
  seaShipPrice: string | null;
  bulkProductionTimeline: string | null;
  airShippingTimeline: string | null;
  seaShippingTimeline: string | null;
  weights: string | null;
  capacityUnits?: number;
};

export function ProductLibrary() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/product-library/products");
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuppliers = async (styleCodes: string[]) => {
    if (styleCodes.length === 0) {
      setSuppliers([]);
      return;
    }

    try {
      const response = await fetch("/api/product-library/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleCodes }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuppliers(data);
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    }
  };

  const handleSelectProduct = (styleCode: string) => {
    const newSelected = selectedCodes.includes(styleCode)
      ? selectedCodes.filter((code) => code !== styleCode)
      : [...selectedCodes, styleCode];

    setSelectedCodes(newSelected);
    fetchSuppliers(newSelected);
  };

  const handleRemoveProduct = (styleCode: string) => {
    const newSelected = selectedCodes.filter((code) => code !== styleCode);
    setSelectedCodes(newSelected);
    fetchSuppliers(newSelected);
  };

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.styleCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.product.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [products, searchTerm]
  );

  const groupedSuppliers = useMemo(() => {
    const groups: Record<string, Supplier[]> = {};
    suppliers.forEach((supplier) => {
      if (!groups[supplier.styleCode]) {
        groups[supplier.styleCode] = [];
      }
      groups[supplier.styleCode].push(supplier);
    });

    // Sort suppliers by lowest price (sea or air)
    Object.keys(groups).forEach((styleCode) => {
      groups[styleCode].sort((a, b) => {
        const priceA = Math.min(
          parseFloat(a.seaShipPrice?.replace("$", "").replace(",", "") || "999999"),
          parseFloat(a.airShipPrice?.replace("$", "").replace(",", "") || "999999")
        );
        const priceB = Math.min(
          parseFloat(b.seaShipPrice?.replace("$", "").replace(",", "") || "999999"),
          parseFloat(b.airShipPrice?.replace("$", "").replace(",", "") || "999999")
        );
        return priceA - priceB;
      });
    });

    return groups;
  }, [suppliers]);

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedCodes.includes(p.styleCode)),
    [products, selectedCodes]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Products</h2>

        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-700">
              {selectedCodes.length > 0
                ? `${selectedCodes.length} product${selectedCodes.length > 1 ? "s" : ""} selected`
                : "Choose products..."}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              <div className="p-3 border-b border-gray-200">
                <input
                  type="text"
                  placeholder="Search by style code or product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <label
                      key={product.styleCode}
                      className="flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCodes.includes(product.styleCode)}
                        onChange={() => handleSelectProduct(product.styleCode)}
                        className="rounded border-gray-300"
                      />
                      <span className="ml-3 text-sm text-gray-700">
                        <span className="font-medium">{product.styleCode}</span>
                        <span className="text-gray-500 ml-2">({product.product})</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">No products found</div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedCodes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedProducts.map((product) => (
              <div
                key={product.styleCode}
                className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-900 rounded-full text-sm"
              >
                <span>{product.styleCode}</span>
                <button
                  onClick={() => handleRemoveProduct(product.styleCode)}
                  className="hover:bg-blue-200 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCodes.length > 0 && (
        <div className="space-y-6">
          {selectedCodes.map((styleCode) => (
            <div key={styleCode} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{styleCode}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {products.find((p) => p.styleCode === styleCode)?.product}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Supplier</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Sales Rep</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Email</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">DDP Sea Price</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">DDP Air Price</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">Weekly Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedSuppliers[styleCode]?.map((supplier) => (
                      <tr key={supplier.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">{supplier.supplierName}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{supplier.salesRep || "—"}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {supplier.email ? (
                            <a href={`mailto:${supplier.email}`} className="text-blue-600 hover:underline">
                              {supplier.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {supplier.seaShipPrice || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {supplier.airShipPrice || "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {supplier.capacityUnits ? `${supplier.capacityUnits} orders` : "—"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(!groupedSuppliers[styleCode] || groupedSuppliers[styleCode].length === 0) && (
                <div className="px-6 py-8 text-center text-gray-500">No suppliers found for this style code</div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedCodes.length === 0 && !isLoading && (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-gray-500">Select one or more products to view supplier details</p>
        </div>
      )}
    </div>
  );
}
