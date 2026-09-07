export const API_ENDPOINTS = {
  auth: {
    register: "/api/auth/register", 
    verify: "/api/auth/verify/token",
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    profile: "/api/auth/profile",
    reset: {
      request: "/api/auth/reset/request",
      confirm: "/api/auth/reset/confirm",
    },
  },
  users: {
    list: "/api/users",
    detail: (id: string) => `/api/users/${id}`,
    update: (id: string) => `/api/users/${id}`,
    delete: (id: string) => `/api/users/${id}`,
  },
  projects: {
    list: "/api/projects",
    detail: (id: string) => `/api/projects/${id}`,
    create: "/api/projects",
    update: (id: string) => `/api/projects/${id}`,
    delete: (id: string) => `/api/projects/${id}`,
  },
};
