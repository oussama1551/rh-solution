import { ReactNode, useMemo, useState } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { LoadingState } from "./LoadingState";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
};

export function DataTable<T>({
  rows,
  columns,
  empty = "Aucune donnée trouvée.",
  pageSize = 20,
  loading = false,
  loadingLabel,
  rowClassName
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  pageSize?: number;
  loading?: boolean;
  loadingLabel?: string;
  rowClassName?: (row: T) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(item => item.key === sort.key);
    if (!column?.sortValue) return rows;

    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
      return sort.dir === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: string) {
    setSort(current => current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  return (
    <div className="table-wrap">
      {loading && <LoadingState label={loadingLabel || "Chargement du tableau..."} />}
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} style={{ width: column.width }}>
                {column.sortValue ? (
                  <button className="sort-button" onClick={() => toggleSort(column.key)}>
                    {column.header}
                    <ArrowDownUp size={13} />
                  </button>
                ) : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={columns.length}>{empty}</td>
            </tr>
          ) : visibleRows.map((row, index) => (
            <tr key={index} className={rowClassName?.(row) || undefined}>
              {columns.map(column => <td key={column.key}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        <span>{rows.length} résultat(s)</span>
        <div className="pagination">
          <Button variant="ghost" disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
            <ChevronLeft size={16} /> Précédent
          </Button>
          <span>Page {safePage} / {totalPages}</span>
          <Button variant="ghost" disabled={safePage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>
            Suivant <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
