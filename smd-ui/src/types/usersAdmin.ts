export type AdminUserRole = 0 | 1 | 2 | 3;

export type AdminUserListItem = {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type UpsertAdminUserRequest = {
  username: string;
  email: string;
  password?: string;
  role: AdminUserRole;
  isActive: boolean;
};
