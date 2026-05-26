import { useEffect, useState, type ReactNode } from "react";
import { GitHubRepoAnalyzer } from "./components/GitHubRepoAnalyzer";
import { QATestCaseSuite, type QATestSuite } from "./components/QATestCaseSuite";
import { API_BASE } from "./lib/api";

const LOADING_MESSAGES = [
  "Analyzing GDD...",
  "Generating QA test cases...",
  "Evaluating technical feasibility...",
];
type AnalysisResult = {
  game_summary: string;
  technical_feasibility: string;
  development_risks: string[];
  qa_test_cases: string[];
  qa_test_suite?: QATestSuite;
  automation_possible_tests: string[];
  manual_tests_required: string[];
  deployment_readiness_score: number;

  repo_summary?: {
    framework: string;
    project_type: string;
    architecture: string;
    deployment_readiness: number;
    risk_level: string;
  };

  scores?: {
    security: number;
    performance: number;
    maintainability: number;
    deployment: number;
    testing: number;
  };

  critical_issues?: string[];

  recommendations?: string[];

  missing_best_practices?: string[];
};
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function getReadinessStyles(score: number) {
  if (score >= 71) {
    return { text: "text-zinc-100", bar: "bg-zinc-300" };
  }
  if (score >= 41) {
    return { text: "text-zinc-100", bar: "bg-zinc-400" };
  }
  return { text: "text-zinc-100", bar: "bg-zinc-500" };
}

function DeploymentScore({ score }: { score: number }) {
  const styles = getReadinessStyles(score);

  return (
    <div className="space-y-3">
      <p className={`text-4xl font-semibold ${styles.text}`}>{score}%</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${styles.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function ListContent({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">None identified.</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-zinc-300">
      {items.map((item, index) => (
        <li key={index} className="rounded-md border border-zinc-800 bg-black px-3 py-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      return;
    }

    setLoadingMessageIndex(0);
    const interval = setInterval(() => {
      setLoadingMessageIndex((index) => (index + 1) % LOADING_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [loading]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded border border-zinc-700 bg-black" />
            <h1 className="text-base font-semibold tracking-wide">QA Pipeline</h1>
          </div>
          <p className="text-xs text-zinc-500">Internal QA Tooling Dashboard</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <aside className="space-y-4 lg:col-span-4">
            <Panel title="GDD Upload">
              <input
                type="file"
                accept=".pdf"
                className="w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-100 hover:file:bg-zinc-800"
                onChange={(e) => {
                  setError(null);
                  setAnalysis(null);
                  if (e.target.files?.[0]) {
                    setFile(e.target.files[0]);
                  }
                }}
              />
              <p className="mt-3 text-xs text-zinc-500">
                {file ? `Selected: ${file.name}` : "No file selected"}
              </p>
              <button
                className="mt-4 w-full rounded-md border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
                onClick={async () => {
                  if (!file) {
                    setError("Please upload a PDF");
                    return;
                  }

                  setLoading(true);
                  setError(null);
                  setAnalysis(null);

                  try {
                    const formData = new FormData();
                    formData.append("file", file);

                    const response = await fetch(`${API_BASE}/api/analyze`, {
                      method: "POST",
                      body: formData,
                    });

                    const data = await response.json();

                    if (!response.ok || !data.success) {
                      setError(data.error || "Analysis failed");
                      return;
                    }

                    setAnalysis({
                      game_summary: data.game_summary ?? "",
                      technical_feasibility: data.technical_feasibility ?? "",
                      development_risks: data.development_risks ?? [],
                      qa_test_cases: data.qa_test_cases ?? [],
                      qa_test_suite: data.qa_test_suite,
                      automation_possible_tests: data.automation_possible_tests ?? [],
                      manual_tests_required: data.manual_tests_required ?? [],
                      deployment_readiness_score: data.deployment_readiness_score ?? 0,
                      repo_summary: data.repo_summary,
                      scores: data.scores,
                      critical_issues: data.critical_issues,
                      recommendations: data.recommendations,
                      missing_best_practices: data.missing_best_practices,
                    });
                  } catch {
                    setError("Could not reach analysis server");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Generate QA
              </button>
              {loading && (
                <p className="mt-3 text-xs text-zinc-400">
                  {LOADING_MESSAGES[loadingMessageIndex]}
                </p>
              )}
              {error && <p className="mt-3 text-sm text-zinc-200">{error}</p>}
            </Panel>

            <Panel title="Deployment Score">
              <DeploymentScore score={analysis?.deployment_readiness_score ?? 0} />
            </Panel>

            <Panel title="Summary">
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Game Summary</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {analysis?.game_summary || "Awaiting generated analysis."}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Technical Feasibility
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {analysis?.technical_feasibility || "Awaiting generated analysis."}
                  </p>
                </div>
              </div>
            </Panel>
          </aside>

          <main className="space-y-4 lg:col-span-8">
            <Panel title="Generated QA Test Cases">
              {!analysis ? (
                <p className="text-sm text-zinc-500">
                  Upload a GDD and click Generate QA to view categorized executable test
                  cases.
                </p>
              ) : analysis.qa_test_suite?.test_cases?.length ? (
                <QATestCaseSuite suite={analysis.qa_test_suite} />
              ) : (
                <ListContent items={analysis.qa_test_cases} />
              )}
            </Panel>
          </main>
        </div>

        <details className="rounded-lg border border-zinc-800 bg-zinc-950">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300">
            Repository Analyzer
          </summary>
          <div className="border-t border-zinc-800 p-4">
            <GitHubRepoAnalyzer />
          </div>
        </details>
      </div>
    </div>
  );
}

export default App;
