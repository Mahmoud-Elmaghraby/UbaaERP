import { useFormContext } from 'react-hook-form';
import type { CustomFieldDefinitionDto } from '@erp-platform/contracts';

import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';

export interface CustomFieldsFormSectionProps {
  /** Definitions for the entity being edited, backend-provided, already sorted or not. */
  definitions: CustomFieldDefinitionDto[];
  /**
   * Path prefix into the surrounding react-hook-form values object, e.g.
   * "customFields" if fields live at `customFields.<fieldKey>`. Defaults
   * to "customFields" to match the convention used when building the
   * schema with buildCustomFieldsSchema and nesting it under that key.
   */
  namePrefix?: string;
}

/**
 * Renders one input per custom field definition (text/number/date/list),
 * wired into the surrounding react-hook-form context via useFormContext.
 * Takes `definitions` as a prop rather than fetching them itself, so this
 * library stays free of any API/network concerns (apps/web owns fetching
 * the definitions for a given entity type and passing them down).
 */
export function CustomFieldsFormSection({
  definitions,
  namePrefix = 'customFields',
}: CustomFieldsFormSectionProps) {
  const { control } = useFormContext();

  if (definitions.length === 0) {
    return null;
  }

  const sorted = [...definitions].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="grid gap-4">
      {sorted.map((def) => {
        const name = `${namePrefix}.${def.fieldKey}`;

        return (
          <FormField
            key={def.id}
            control={control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {def.label}
                  {def.isRequired ? ' *' : ''}
                </FormLabel>
                <FormControl>{renderInput(def, field)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderInput(def: CustomFieldDefinitionDto, field: any) {
  switch (def.fieldType) {
    case 'number':
      return <Input type="number" {...field} value={field.value ?? ''} />;
    case 'date':
      return (
        <Input
          type="date"
          {...field}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(e.target.value)}
        />
      );
    case 'list':
      return (
        <Select onValueChange={field.onChange} value={field.value ?? undefined}>
          <SelectTrigger>
            <SelectValue placeholder="اختر..." />
          </SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'text':
    default:
      return <Input type="text" {...field} value={field.value ?? ''} />;
  }
}
