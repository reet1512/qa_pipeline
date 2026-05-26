import { useEffect, useState, type ReactNode } from "react";
import { GitHubRepoAnalyzer } from "./components/GitHubRepoAnalyzer";
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
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function getReadinessStyles(score: number) {
  if (score >= 71) {
    return { text: "text-emerald-400", bar: "bg-emerald-500" };
  }
  if (score >= 41) {
    return { text: "text-yellow-400", bar: "bg-yellow-500" };
  }
  return { text: "text-red-400", bar: "bg-red-500" };
}

function DeploymentScore({ score }: { score: number }) {
  const styles = getReadinessStyles(score);

  return (
    <div className="space-y-4">
      <p className={`text-5xl font-bold tracking-tight ${styles.text}`}>{score}%</p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${styles.bar}`}
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
    <ul className="space-y-2 text-sm text-zinc-200">
      {items.map((item, index) => (
        <li key={index} className="rounded-lg bg-zinc-950/60 px-3 py-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

function getRiskBadgeStyles(level: string) {
  const normalized = (level || "UNKNOWN").toUpperCase();

  if (normalized === "LOW") {
    return {
      label: normalized,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    };
  }
  if (normalized === "MEDIUM") {
    return {
      label: normalized,
      className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    };
  }
  if (normalized === "HIGH") {
    return {
      label: normalized,
      className: "border-red-500/30 bg-red-500/10 text-red-400",
    };
  }
  return {
    label: normalized,
    className: "border-zinc-600 bg-zinc-800/80 text-zinc-400",
  };
}

function RiskBadge({ level }: { level: string }) {
  const { label, className } = getRiskBadgeStyles(level);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function ScoreMetric({ label, score }: { label: string; score: number }) {
  const styles = getReadinessStyles(score);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <span className={`text-lg font-bold tabular-nums ${styles.text}`}>{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${styles.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function RepoSummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value || "—"}</p>
    </div>
  );
}

function Phase2QADashboard({ analysis }: { analysis: AnalysisResult }) {
  const repo = analysis.repo_summary;
  const scores = analysis.scores;

  return (
    <div className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Repository & QA Insights
        </h2>
        <p className="text-sm text-zinc-500">
          Repository analysis, risk posture, and quality scores
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="Repository Summary">
          <div className="grid gap-3 sm:grid-cols-2">
            <RepoSummaryField label="Framework" value={repo?.framework ?? ""} />
            <RepoSummaryField label="Project Type" value={repo?.project_type ?? ""} />
            <RepoSummaryField
              label="Architecture"
              value={repo?.architecture ?? ""}
            />
          </div>
        </SectionCard>

        <SectionCard title="Risk Level">
          <div className="flex flex-col gap-4">
            <RiskBadge level={repo?.risk_level ?? "UNKNOWN"} />
            <p className="text-sm leading-relaxed text-zinc-400">
              Overall repository risk classification based on structure, dependencies, and
              deployment posture.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Deployment Readiness">
        <DeploymentScore score={repo?.deployment_readiness ?? 0} />
      </SectionCard>

      <SectionCard title="Quality Scores">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ScoreMetric label="Security" score={scores?.security ?? 0} />
          <ScoreMetric label="Performance" score={scores?.performance ?? 0} />
          <ScoreMetric label="Maintainability" score={scores?.maintainability ?? 0} />
          <ScoreMetric label="Deployment" score={scores?.deployment ?? 0} />
          <ScoreMetric label="Testing" score={scores?.testing ?? 0} />
        </div>
      </SectionCard>

      <SectionCard title="Critical Issues">
        <ListContent items={analysis.critical_issues ?? []} />
      </SectionCard>

      <SectionCard title="Recommendations">
        <ListContent items={analysis.recommendations ?? []} />
      </SectionCard>

      <SectionCard title="Missing Best Practices">
        <ListContent items={analysis.missing_best_practices ?? []} />
      </SectionCard>
    </div>
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">AI Game QA Pipeline</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Upload a GDD PDF to generate structured QA analysis
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <input
            type="file"
            accept=".pdf"
            className="w-full text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700"
            onChange={(e) => {
              setError(null);
              setAnalysis(null);
              if (e.target.files?.[0]) {
                setFile(e.target.files[0]);
              }
            }}
          />

          {file && (
            <p className="mt-3 text-sm text-emerald-400">Selected: {file.name}</p>
          )}

          <button
            className="mt-4 w-full rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
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
            Analyze GDD
          </button>

          {loading && (
            <p className="mt-3 text-sm text-zinc-300">{LOADING_MESSAGES[loadingMessageIndex]}</p>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
        </div>

        <GitHubRepoAnalyzer />

        {!loading && analysis && (
          <div className="flex flex-col gap-4">
            <SectionCard title="Game Summary">
              <p className="text-sm leading-relaxed text-zinc-200">
                {analysis.game_summary || "No summary provided."}
              </p>
            </SectionCard>

            <SectionCard title="Technical Feasibility">
              <p className="text-sm leading-relaxed text-zinc-200">
                {analysis.technical_feasibility || "No feasibility notes provided."}
              </p>
            </SectionCard>

            <SectionCard title="Development Risks">
              <ListContent items={analysis.development_risks} />
            </SectionCard>

            <SectionCard title="QA Test Cases">
              <ListContent items={analysis.qa_test_cases} />
            </SectionCard>

            <SectionCard title="Automation Possible Tests">
              <ListContent items={analysis.automation_possible_tests} />
            </SectionCard>

            <SectionCard title="Manual Tests Required">
              <ListContent items={analysis.manual_tests_required} />
            </SectionCard>

            <SectionCard title="Deployment Readiness Score">
              <DeploymentScore score={analysis.deployment_readiness_score} />
            </SectionCard>

            <Phase2QADashboard analysis={analysis} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
