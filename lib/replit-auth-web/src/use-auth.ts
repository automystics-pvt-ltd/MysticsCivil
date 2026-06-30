import { useCallback } from "react";
import {
  useGetCurrentAuthUser,
  getGetCurrentAuthUserQueryKey,
  type AuthUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export type { AuthUser };

type LoginInput = { email: string; password: string };
type RegisterInput = {
  email: string;
  password: string;
  orgName: string;
  firstName?: string;
  lastName?: string;
};

function apiBase(): string {
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  return `${String(base).replace(/\/$/, "")}/api`;
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export function useAuth() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetCurrentAuthUser();
  const user = (data as any)?.user ?? null;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
  }, [qc]);

  const login = useCallback(
    async (input: LoginInput) => {
      await postJson("/auth/login", input);
      await invalidate();
    },
    [invalidate]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await postJson("/auth/register", input);
      await invalidate();
    },
    [invalidate]
  );

  const logout = useCallback(async () => {
    try { await postJson("/auth/logout", {}); } catch { /* ignore */ }
    qc.setQueryData(getGetCurrentAuthUserQueryKey(), { user: null });
    await invalidate();
  }, [invalidate, qc]);

  return {
    user: user as AuthUser | null,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };
}
