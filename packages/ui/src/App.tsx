import { useEffect, useState, type ReactNode } from "react";

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
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
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

                const response = await fetch("https://ai-gdd-backend.onrender.com/api/analyze", {
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
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
