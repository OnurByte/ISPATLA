import { AuthForm } from "@/components/auth-form"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  return <AuthForm mode="reset" token={typeof token === "string" ? token : undefined} />
}
