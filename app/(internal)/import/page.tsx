import { requireInternal } from "@/lib/permissions";
import { CsvImport } from "@/components/import/CsvImport";

export default async function ImportPage() {
  const session = await requireInternal();
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Import</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload a CSV export to update the orders database</p>
      </div>
      <CsvImport userRole={session.user.role} />
    </div>
  );
}
