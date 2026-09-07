"use client";

import dynamic from "next/dynamic";
import { DataTableSkeleton } from "./data-table-skeleton";

export const LazyDataTable = dynamic(
  () => import("./data-table").then((m) => m.DataTable),
  { loading: () => <DataTableSkeleton columnCount={6} rowCount={10} /> }
);
