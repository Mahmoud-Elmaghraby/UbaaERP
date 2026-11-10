/**
 * tenant_settings (master doc §16.1): one singleton row per tenant.
 * Plain-CRUD module (master doc §4) — no aggregate, just a shape + a
 * narrow update input.
 */
export interface TenantSettings {
  id: string;
  currencyCode: string;
  companyName: string | null;
  address: string | null;
  taxRegistrationNumber: string | null;
  /** Migration 0093 — printed on every document header. */
  commercialRegister: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Object storage key of the company logo (null = none). */
  logoObjectKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateTenantSettingsInput {
  currencyCode?: string;
  companyName?: string | null;
  address?: string | null;
  taxRegistrationNumber?: string | null;
  commercialRegister?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoObjectKey?: string | null;
}
