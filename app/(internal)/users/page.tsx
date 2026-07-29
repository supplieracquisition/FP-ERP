import { requireInternal } from "@/lib/permissions";
import { UsersManager } from "@/components/users/UsersManager";

export default async function UsersPage() {
  await requireInternal();
  return <UsersManager />;
}
