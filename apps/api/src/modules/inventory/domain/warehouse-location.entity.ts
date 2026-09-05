export interface WarehouseLocation {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseLocationInput {
  warehouseId: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface UpdateWarehouseLocationInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

/** Code/name given to the location every warehouse gets automatically on creation. */
export const DEFAULT_LOCATION_CODE = 'DEFAULT';
export const DEFAULT_LOCATION_NAME = 'الموقع الرئيسي';
