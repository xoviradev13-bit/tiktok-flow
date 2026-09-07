"use client";

import { LoginView } from "@/features/auth/views/LoginView";
import { AuthLayout } from "@/features/auth/components/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginView />
    </AuthLayout>
  );
}
