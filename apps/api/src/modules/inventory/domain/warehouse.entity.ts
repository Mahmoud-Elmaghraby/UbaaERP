export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  branchId: string | null;
  isActive: boolean;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseInput {
  name: string;
  code: string;
  address?: string | null;
  branchId?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}

export interface UpdateWarehouseInput {
  name?: string;
  code?: string;
  address?: string | null;
  branchId?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}
