import { AuthForm } from "@/components/auth-form"

export default function SignupPage() {
  return <AuthForm mode="signup" privateBeta={process.env.ISPATLA_PRIVATE_BETA === "1"} />
}
