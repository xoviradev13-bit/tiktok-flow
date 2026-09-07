import React from "react";
import ResetPasswordView from "@/features/auth/views/ResetPasswordView";
import { AuthLayout } from "@/features/auth/components/AuthLayout";

export default function Page() {
  return (
    <AuthLayout>
      <ResetPasswordView />
    </AuthLayout>
  );
}


