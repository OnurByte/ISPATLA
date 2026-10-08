import type { ReactNode } from "react"
import { requirePageUser } from "@/server/page-auth"

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePageUser()
  return children
}
