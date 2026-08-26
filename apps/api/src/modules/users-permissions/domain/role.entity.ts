export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissionKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleInput {
  name: string;
  permissionKeys: string[];
}

export interface UpdateRoleInput {
  name?: string;
  permissionKeys?: string[];
}
