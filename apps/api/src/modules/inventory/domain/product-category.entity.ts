export interface ProductCategory {
  id: string;
  name: string;
  /** null = top-level category. */
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductCategoryInput {
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

export type UpdateProductCategoryInput = Partial<CreateProductCategoryInput>;

export interface ProductBrand {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductBrandInput {
  name: string;
  isActive?: boolean;
}

export type UpdateProductBrandInput = Partial<CreateProductBrandInput>;
