import { useState, useMemo } from "react";

// Generic click-to-sort hook. Pass an array of rows; get back the sorted
// array, a requestSort(key) function to attach to <th onClick>, and a
// sortIndicator(key) helper that prints an arrow on the active column.
export function useSortableData(items) {
  const [sortConfig, setSortConfig] = useState(null);

  const sortedItems = useMemo(() => {
    const list = items || [];
    if (!sortConfig) return list;
    const { key, direction } = sortConfig;

    return [...list].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      const aNum = Number(aVal);
      const bNum = Number(bVal);
      const bothNumeric = aVal !== "" && bVal !== "" && !isNaN(aNum) && !isNaN(bNum);

      if (bothNumeric) {
        aVal = aNum;
        bVal = bNum;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [items, sortConfig]);

  const requestSort = (key) => {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const sortIndicator = (key) => {
    if (!sortConfig || sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return { sortedItems, requestSort, sortIndicator };
}
