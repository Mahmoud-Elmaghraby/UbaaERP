export interface User {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Service-facing input — carries a plaintext password. UsersService
 * hashes it before it ever reaches the repository (see
 * application/ports/user.repository.ts's CreateUserRecord). */
export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  fullName?: string;
  roleId?: string;
  isActive?: boolean;
}
