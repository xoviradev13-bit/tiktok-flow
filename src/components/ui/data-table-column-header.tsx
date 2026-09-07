import {
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { Column } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableColumnHeaderProps<TData = any, TValue = any>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: any
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn("text-xs font-medium text-zinc-500 tracking-tight", className)}>{title}</div>
  }

  const isSorted = column.getIsSorted()

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 hover:bg-zinc-100 data-[state=open]:bg-accent px-3 py-1 cursor-pointer group"
        onClick={() => column.toggleSorting(isSorted === "asc")}
      >
        <span className="text-xs font-medium text-zinc-500 tracking-tight group-hover:text-zinc-800">{title}</span>
        <div className="flex flex-col ml-2 items-center -space-y-1">
          <ChevronUp className={cn("h-3.5 w-3.5 transition-colors", isSorted === "asc" ? "text-blue-600" : "text-zinc-300 group-hover:text-zinc-400")} />
          <ChevronDown className={cn("h-3.5 w-3.5 transition-colors", isSorted === "desc" ? "text-blue-600" : "text-zinc-300 group-hover:text-zinc-400")} />
        </div>
      </Button>
    </div>
  )
}
