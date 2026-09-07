"use client";

import { RegisterView } from "@/features/auth/views/RegisterView";
import { AuthLayout } from "@/features/auth/components/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout>
      <RegisterView />
    </AuthLayout>
  );
}
