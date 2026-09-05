import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Shows skeleton rows instead of data — pass while the underlying query is loading. */
  isLoading?: boolean;
  /** Message shown when data is loaded but empty. Defaults to a generic Arabic message. */
  emptyMessage?: string;
  /** Rows per page. Set to 0 (or Infinity) to disable client-side pagination entirely. */
  pageSize?: number;
  /** Optional content (search box, filters, "new" button) rendered above the table. */
  toolbar?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
}

/**
 * Generic data-heavy table built on @tanstack/react-table (CLAUDE.md §8: "TanStack
 * Table for data-heavy tables"). Presentational only — client-side sorting +
 * pagination, no data-fetching opinions. Feature modules hand it already-fetched
 * rows and a ColumnDef[] describing their own columns.
 *
 * RTL-aware: relies on the shared <Table>'s logical (text-start) alignment and
 * horizontal-scroll wrapper, so it works unmodified in the app's Arabic/RTL layout
 * and stays usable on narrow screens (the table scrolls inside its own container
 * instead of breaking the page layout).
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'لا توجد نتائج',
  pageSize = 10,
  toolbar,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const paginationEnabled = Number.isFinite(pageSize) && pageSize > 0;
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: paginationEnabled ? pageSize : data.length || 1,
  });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-start font-medium hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sortDirection === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <TableCell key={`skeleton-cell-${cellIndex}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {paginationEnabled && !isLoading && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            صفحة {table.getState().pagination.pageIndex + 1} من {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
