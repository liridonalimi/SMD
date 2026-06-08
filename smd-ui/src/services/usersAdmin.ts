import { http } from "./http";
import type { AdminUserListItem, UpsertAdminUserRequest } from "../types/usersAdmin";

export function listAdminUsers(signal?: AbortSignal) {
  return http<AdminUserListItem[]>("/api/admin/users", { signal });
}

export function createAdminUser(body: UpsertAdminUserRequest, signal?: AbortSignal) {
  return http("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function updateAdminUser(id: string, body: UpsertAdminUserRequest, signal?: AbortSignal) {
  return http(`/api/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  });
}
