import { requireInternal } from "@/lib/permissions";
import { POBuilder } from "@/components/po-builder/POBuilder";

export default async function POBuilderPage() {
  await requireInternal();
  return <POBuilder />;
}
