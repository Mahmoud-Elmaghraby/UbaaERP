import { useMemo } from 'react';

import { useAllWarehouseLocations, useWarehouses } from '../../api/warehouses/queries';

export function useLocationLookups() {
  const { data: warehouses } = useWarehouses();
  const { data: locations } = useAllWarehouseLocations();
  const warehouseById = useMemo(() => new Map((warehouses ?? []).map((w) => [w.id, w])), [warehouses]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  return { warehouseById, locationById };
}
