import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Search } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Shows skeleton rows instead of data — pass while the underlying query is loading. */
  isLoading?: boolean;
  /** Message shown when data is loaded but empty. Defaults to a generic Arabic message. */
  emptyMessage?: string;
  /** Optional richer empty state (icon + description + action) — overrides emptyMessage. */
  emptyState?: React.ReactNode;
  /** Rows per page. Set to 0 (or Infinity) to disable client-side pagination entirely. */
  pageSize?: number;
  /** Optional content (filters, "new" button) rendered in the table's header bar. */
  toolbar?: React.ReactNode;
  /** Client-side quick search across all text columns. On by default. */
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  className?: string;
}

/**
 * Generic data-heavy table built on @tanstack/react-table (CLAUDE.md §8: "TanStack
 * Table for data-heavy tables"). Presentational only — client-side search, sorting and
 * pagination, no data-fetching opinions. Feature modules hand it already-fetched rows
 * and a ColumnDef[] describing their own columns.
 *
 * Visual contract (claude/ui-redesign-plan.md): the table always sits in its own card
 * with a header bar (search + toolbar), row height follows the user's density
 * preference (--row-h), and pagination shows "عرض x–y من z".
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'لا توجد نتائج',
  emptyState,
  pageSize = 10,
  toolbar,
  searchable = true,
  searchPlaceholder = 'بحث…',
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const paginationEnabled = Number.isFinite(pageSize) && pageSize > 0;
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: paginationEnabled ? pageSize : Number.MAX_SAFE_INTEGER,
  });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const columnCount = columns.length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const from = filteredCount === 0 ? 0 : pageIndex * currentPageSize + 1;
  const to = Math.min(filteredCount, (pageIndex + 1) * currentPageSize);
  const showHeaderBar = searchable || Boolean(toolbar);
  const isFiltering = globalFilter.trim().length > 0;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card',
        className,
      )}
    >
      {showHeaderBar ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {searchable ? (
            <label className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={globalFilter}
                onChange={(event) => {
                  setGlobalFilter(event.target.value);
                  table.setPageIndex(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          ) : null}
          {toolbar ? <div className="min-w-0 flex-1">{toolbar}</div> : null}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1 text-start font-medium hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-foreground" />
                        ) : sortDirection === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5 text-foreground" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
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
              <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                {Array.from({ length: columnCount }).map((__, cellIndex) => (
                  <TableCell key={`skeleton-cell-${cellIndex}`}>
                    <Skeleton className="h-4 w-full max-w-[160px]" />
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
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-auto p-0">
                {emptyState && !isFiltering ? (
                  emptyState
                ) : (
                  <EmptyState
                    icon={isFiltering ? <Search /> : <Inbox />}
                    title={isFiltering ? 'لا توجد نتائج مطابقة للبحث' : emptyMessage}
                    description={isFiltering ? 'جرّب كلمة بحث مختلفة.' : undefined}
                  />
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {paginationEnabled && !isLoading && filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-[13px] text-muted-foreground">
          <span>
            عرض <span className="tabular font-medium text-foreground">{from}</span>–
            <span className="tabular font-medium text-foreground">{to}</span> من{' '}
            <span className="tabular font-medium text-foreground">{filteredCount}</span>
          </span>
          {table.getPageCount() > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight />
              </Button>
              <span className="tabular px-2">
                {pageIndex + 1} / {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="الصفحة التالية"
              >
                <ChevronLeft />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
