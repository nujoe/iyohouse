import SanityStudioClient from "@/components/admin/SanityStudioClient"
import { requireAdminClient } from "@/lib/admin/workshopAdmin"

export const dynamic = "force-dynamic"

export default async function StudioPage() {
  await requireAdminClient()

  return <SanityStudioClient />
}
