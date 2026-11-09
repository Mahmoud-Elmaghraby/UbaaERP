import { useTranslation } from 'react-i18next';
import type { PermissionDto } from '@erp-platform/contracts';
import { Checkbox } from '@erp-platform/ui';

/**
 * The permissions of a role, grouped by module (the key's first segment), with group select-all.
 * Arabic labels from i18n, the stored English description as fallback for keys the UI doesn't know yet.
 */
export function PermissionMatrix({
  permissions,
  selected,
  onChange,
  disabled,
}: {
  permissions: PermissionDto[];
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const groups = new Map<string, PermissionDto[]>();
  for (const permission of permissions) {
    const module = permission.key.split('.')[0] ?? permission.key;
    groups.set(module, [...(groups.get(module) ?? []), permission]);
  }
  const labelOf = (key: string, fallback: string) =>
    t(`roles.permissionLabels.${key.replace(/\./g, '__')}`, { defaultValue: fallback });
  const toggle = (keys: string[], checked: boolean) =>
    onChange(checked ? [...new Set([...selected, ...keys])] : selected.filter((k) => !keys.includes(k)));

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[...groups.entries()].map(([module, items]) => {
        const keys = items.map((item) => item.key);
        const selectedCount = keys.filter((key) => selected.includes(key)).length;
        return (
          <fieldset key={module} className="grid content-start gap-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === keys.length ? true : selectedCount > 0 ? 'indeterminate' : false}
                  onCheckedChange={(checked) => toggle(keys, checked === true)}
                  disabled={disabled}
                />
                {t(`roles.permissionGroups.${module}`, { defaultValue: module })}
                <span className="text-xs font-normal text-muted-foreground">
                  {selectedCount}/{keys.length}
                </span>
              </label>
            </legend>
            {items.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.includes(permission.key)}
                  onCheckedChange={(checked) => toggle([permission.key], checked === true)}
                  disabled={disabled}
                />
                <span>{labelOf(permission.key, permission.description)}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
