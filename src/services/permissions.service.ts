import axios from "axios";

export const permissionsService = {
  invitations: {
    accept: async ({ token }: { token: string }, _session?: any) => {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      return res;
    },
  },
};

export default permissionsService;
