"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Trash2, X, Settings2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface DataTableProps<TData = any, TValue = any> {
  columns: ColumnDef<any, any>[]
  data: TData[]
  onDeleteSelected?: (rows: TData[]) => void
  onTableReady?: (table: import("@tanstack/react-table").Table<TData>) => void
  rowSelection?: Record<string, boolean>
  onRowSelectionChange?: (rowSelection: Record<string, boolean>) => void
  renderRowContextMenu?: (row: TData) => React.ReactNode
  hideToolbar?: boolean
  hideHeader?: boolean
  onlyHeader?: boolean
  showBorders?: boolean
  columnVisibility?: import("@tanstack/react-table").VisibilityState
  onColumnVisibilityChange?: React.Dispatch<React.SetStateAction<import("@tanstack/react-table").VisibilityState>>
  sorting?: import("@tanstack/react-table").SortingState
  onSortingChange?: React.Dispatch<React.SetStateAction<import("@tanstack/react-table").SortingState>>
}

export function DataTable<TData = any, TValue = any>({
  columns,
  data,
  onDeleteSelected,
  onTableReady,
  rowSelection: externalRowSelection,
  onRowSelectionChange,
  renderRowContextMenu,
  hideToolbar = false,
  hideHeader = false,
  onlyHeader = false,
  showBorders = false,
  columnVisibility: externalColumnVisibility,
  onColumnVisibilityChange,
  sorting: externalSorting,
  onSortingChange,
}: DataTableProps<TData, TValue>) {
  const [internalRowSelection, setInternalRowSelection] = React.useState<Record<string, boolean>>({})

  const [internalColumnVisibility, setInternalColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([{ id: "updatedAt", desc: true }])

  const columnVisibility = externalColumnVisibility !== undefined ? externalColumnVisibility : internalColumnVisibility;
  const setColumnVisibility = onColumnVisibilityChange || setInternalColumnVisibility;

  const sorting = externalSorting !== undefined ? externalSorting : internalSorting;
  const setSorting = onSortingChange || setInternalSorting;

  const rowSelection = externalRowSelection !== undefined ? externalRowSelection : internalRowSelection;
  const setRowSelection = onRowSelectionChange || setInternalRowSelection;

  const table = useReactTable({
    data,
    columns,
    getRowId: (row: any) => row?.id || row?.key || row?._id || String(row?.name || row?.title || Math.random()),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    // we use manual pagination through our own APIs usually, so just render all rows
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  // Cache selected row data across pagination
  const selectedRowsCacheRef = React.useRef<Map<string, TData>>(new Map());

  React.useEffect(() => {
    if (data && Array.isArray(data)) {
      data.forEach((item: any) => {
        const id = item?.id || item?.key || item?._id || String(item?.name || item?.title);
        if (id && rowSelection[id]) {
          selectedRowsCacheRef.current.set(id, item);
        }
      });
      for (const id of Array.from(selectedRowsCacheRef.current.keys())) {
        if (!rowSelection[id]) {
          selectedRowsCacheRef.current.delete(id);
        }
      }
    }
  }, [data, rowSelection]);

  React.useEffect(() => {
    if (onTableReady) {
      onTableReady(table)
    }
  }, [table, onTableReady])

  // Bulk action banner: count all selected keys across pages
  const selectedIds = React.useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k]);
  }, [rowSelection]);
  const selectedCount = selectedIds.length;
  const hasSelected = selectedCount > 0;

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      {/* Table Toolbar Area: Column Filter */}
      {!hideToolbar && (
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto flex items-center gap-2"
              >
                <Settings2 className="h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px]">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" && column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className={cn(
        "w-full bg-card relative",
        showBorders ? "rounded-md border" : "border-b",
        (hideHeader || onlyHeader) && "border-0 shadow-none bg-transparent",
        onlyHeader && "mb-0 pb-0"
      )}>
        <Table containerClassName="toolbar-scroll-x">
          {(!hideHeader || onlyHeader) && (
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className={cn(onlyHeader && "hover:bg-transparent border-none")}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan} className={(header.column.columnDef.meta as any)?.className}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
          )}
          {!onlyHeader && (
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => {
                  const rowNode = (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className={cn("hover:bg-muted/50 cursor-pointer", hideHeader && "border-none")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={(cell.column.columnDef.meta as any)?.className}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );

                  if (renderRowContextMenu) {
                    return (
                      <ContextMenu key={row.id}>
                        <ContextMenuTrigger asChild>
                          {rowNode}
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56 p-1 rounded-xl shadow-xl border-zinc-200">
                          {renderRowContextMenu(row.original)}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  }

                  return rowNode;
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          )}
        </Table>

        {/* Floating Bulk Action Banner — fixed bottom center */}
        {hasSelected && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white/90 px-5 py-3 shadow-2xl shadow-zinc-200/60 backdrop-blur-md ring-1 ring-zinc-100 transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
            <span className="text-sm font-medium text-zinc-700">
              {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
            </span>
            <div className="h-4 w-px bg-zinc-200" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                table.resetRowSelection();
                setRowSelection({});
              }}
              className="h-8 gap-1.5 px-3 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Deselect
            </Button>
            {onDeleteSelected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  const allSelectedRows = selectedIds.map(
                    (id) => selectedRowsCacheRef.current.get(id) || ({ id } as unknown as TData)
                  );
                  onDeleteSelected(allSelectedRows);
                  table.resetRowSelection();
                  setRowSelection({});
                }}
                className="h-8 gap-1.5 px-3 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Selected
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
