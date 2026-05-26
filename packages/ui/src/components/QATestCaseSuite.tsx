import { useMemo } from "react";

export type QATestCase = {
  id: string;
  title: string;
  category: string;
  priority: string;
  preconditions: string[];
  steps: string[];
  expected_result: string;
};

export type QATestSuite = {
  system: string;
  test_cases: QATestCase[];
};

const CATEGORIES = ["Functional", "Edge Case", "Negative", "Regression"] as const;

function normalizeCategory(category: string): (typeof CATEGORIES)[number] {
  const normalized = (category || "").trim().toLowerCase();
  if (normalized.includes("edge")) return "Edge Case";
  if (normalized.includes("negative")) return "Negative";
  if (normalized.includes("regression")) return "Regression";
  return "Functional";
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-zinc-200"
    >
      {priority}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
      {category}
    </span>
  );
}

function TestCaseCard({ testCase }: { testCase: QATestCase }) {
  return (
    <article className="rounded-lg border border-zinc-800 bg-black p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-zinc-400">{testCase.id}</p>
          <h3 className="mt-1 text-sm font-semibold text-zinc-100">{testCase.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <CategoryBadge category={testCase.category} />
          <PriorityBadge priority={testCase.priority} />
        </div>
      </div>
      <details className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-zinc-200">
          Expand steps and expected result
        </summary>
        <div className="mt-3 space-y-3">
          {testCase.preconditions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Preconditions</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                {testCase.preconditions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Steps</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
              {testCase.steps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Expected result</p>
            <p className="mt-1 text-sm text-zinc-200">{testCase.expected_result}</p>
          </div>
        </div>
      </details>
    </article>
  );
}

export function QATestCaseSuite({ suite }: { suite: QATestSuite }) {
  const normalizedCases = useMemo(
    () =>
      suite.test_cases.map((testCase) => ({
        ...testCase,
        category: normalizeCategory(testCase.category),
      })),
    [suite.test_cases]
  );

  const grouped = useMemo(() => {
    const map: Record<string, QATestCase[]> = {
      Functional: [],
      "Edge Case": [],
      Negative: [],
      Regression: [],
    };
    for (const testCase of normalizedCases) {
      if (map[testCase.category]) {
        map[testCase.category].push(testCase);
      }
    }
    return map;
  }, [normalizedCases]);

  const stats = useMemo(
    () => ({
      total: suite.test_cases.length,
      functional: grouped.Functional.length,
      edgeCase: grouped["Edge Case"].length,
      regression: grouped.Regression.length,
    }),
    [suite.test_cases.length, grouped]
  );

  const downloadFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    downloadFile(
      "qa-test-cases.json",
      JSON.stringify({ ...suite, test_cases: normalizedCases }, null, 2),
      "application/json;charset=utf-8"
    );
  };

  const handleDownloadExcel = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "QA Pipeline";
    workbook.created = new Date();

    const columns = [
      { key: "id", header: "Test ID" },
      { key: "system", header: "System" },
      { key: "category", header: "Category" },
      { key: "priority", header: "Priority" },
      { key: "title", header: "Title" },
      { key: "preconditions", header: "Preconditions" },
      { key: "steps", header: "Steps" },
      { key: "expected_result", header: "Expected Result" },
    ] as const;

    const formatList = (items: string[]) =>
      items.map((item, index) => `${index + 1}. ${item}`).join("\n\n");

    const applyPriorityFill = (cell: ExcelJS.Cell, priority: string) => {
      const normalized = priority.toLowerCase();
      if (normalized.includes("critical")) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF5A0F0F" },
        };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      } else if (normalized.includes("high")) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF9A3412" },
        };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      } else if (normalized.includes("medium")) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD4A017" },
        };
        cell.font = { color: { argb: "FF111111" }, bold: true };
      } else if (normalized.includes("low")) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF6B7280" },
        };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      }
    };

    const categorySheets = [
      { name: "All_Test_Cases", rows: normalizedCases },
      ...CATEGORIES.map((category) => ({
        name: category.replace(" ", "_"),
        rows: normalizedCases.filter((tc) => tc.category === category),
      })),
    ];

    for (const sheetMeta of categorySheets) {
      const sheet = workbook.addWorksheet(sheetMeta.name);
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      sheet.columns = columns.map((col) => ({
        key: col.key,
        header: col.header,
        width: 16,
      }));

      for (const testCase of sheetMeta.rows) {
        const row = sheet.addRow({
          id: testCase.id,
          system: suite.system,
          category: testCase.category,
          priority: testCase.priority,
          title: testCase.title,
          preconditions: formatList(testCase.preconditions),
          steps: formatList(testCase.steps),
          expected_result: testCase.expected_result,
        });

        row.height = 42;
        row.alignment = { vertical: "top", horizontal: "left", wrapText: false };
      }

      const headerRow = sheet.getRow(1);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF111111" },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF404040" } },
          left: { style: "thin", color: { argb: "FF404040" } },
          bottom: { style: "thin", color: { argb: "FF404040" } },
          right: { style: "thin", color: { argb: "FF404040" } },
        };
      });

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };

      const wrapColumns = new Set(["preconditions", "steps", "expected_result"]);
      const priorityColumnIndex = columns.findIndex((c) => c.key === "priority") + 1;

      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };

          if (rowNumber > 1 && rowNumber % 2 === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF9FAFB" },
            };
          }

          const key = columns[colNumber - 1]?.key;
          const wrapText = key ? wrapColumns.has(key) : false;
          cell.alignment = {
            vertical: "top",
            horizontal: colNumber === 4 ? "center" : "left",
            wrapText,
          };
        });

        if (rowNumber > 1) {
          applyPriorityFill(row.getCell(priorityColumnIndex), String(row.getCell(priorityColumnIndex).value ?? ""));
        }
      });

      columns.forEach((col, index) => {
        let maxLength = col.header.length;
        sheet.getColumn(index + 1).eachCell((cell) => {
          const cellText = String(cell.value ?? "");
          const longestLine = Math.max(...cellText.split("\n").map((line) => line.length), 0);
          if (longestLine > maxLength) {
            maxLength = longestLine;
          }
        });
        sheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, 12), 60);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qa-test-management.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (suite.test_cases.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No structured test cases were returned. Re-run analysis with an updated backend.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Test Cases" value={stats.total} />
        <StatCard label="Functional Count" value={stats.functional} />
        <StatCard label="Edge Case Count" value={stats.edgeCase} />
        <StatCard label="Regression Count" value={stats.regression} />
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-sm text-zinc-400">
          System: <span className="text-zinc-200">{suite.system}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Download Excel
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category) => (
          <details key={category} className="rounded-lg border border-zinc-800 bg-zinc-950/30" open>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-200">
              {category} ({grouped[category].length})
            </summary>
            <div className="max-h-[28rem] space-y-3 overflow-y-auto border-t border-zinc-800 p-3">
              {grouped[category].length === 0 ? (
                <p className="text-sm text-zinc-500">No test cases in this category.</p>
              ) : (
                grouped[category].map((testCase) => (
                  <TestCaseCard key={testCase.id} testCase={testCase} />
                ))
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black px-3 py-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
