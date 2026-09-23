import { requireInternal } from "@/lib/permissions";
import { CsvImport } from "@/components/import/CsvImport";
import { HowItWorks } from "@/components/help/HowItWorks";

export default async function ImportPage() {
  const session = await requireInternal();
  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload a CSV export to update the orders database</p>
        </div>
        <HowItWorks topic="import" />
      </div>
      <CsvImport userRole={session.user.role} />
    </div>
  );
}
