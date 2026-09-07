import React from "react";
import RequestResetPasswordView from "@/features/auth/views/RequestResetPasswordView";
import { AuthLayout } from "@/features/auth/components/AuthLayout";

export default function Page() {
  return (
    <AuthLayout>
      <RequestResetPasswordView />
    </AuthLayout>
  );
}


