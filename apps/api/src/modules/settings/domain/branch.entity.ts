export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}
