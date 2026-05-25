import { useState, type ReactNode } from "react";

const API_BASE = "http://localhost:3001";

type SuggestedTicket = {
  title?: string;
  priority?: string;
  category?: string;
  description?: string;
  business_impact?: string;
  recommended_action?: string;
};

type RepoAnalysisResponse = {
  success?: boolean;
  cached?: boolean;
  repository?: {
    name?: string;
    description?: string;
    stars?: number;
    language?: string;
  };
  executive_summary?: {
    project_overview?: string;
    complexity_level?: string;
    stability_assessment?: string;
    operational_risks?: string[];
    maintainability?: string;
    testing_maturity?: string;
    recommended_priorities?: string[];
  };
  analysis?: {
    summary?: string;
    strengths?: string[];
    risks?: string[];
    recommendations?: string[];
    engineeringScore?: number;
    suggested_tickets?: SuggestedTicket[];
  };
  techContext?: {
    detected?: Record<string, string>;
  };
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

function TextBlock({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-zinc-200">{children}</p>
  );
}

function BulletList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-zinc-200">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 rounded-lg bg-zinc-950/60 px-3 py-2">
          <span className="mt-0.5 shrink-0 text-zinc-500">•</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const normalized = (priority || "Medium").toLowerCase();
  let className =
    "border-zinc-600 bg-zinc-800/80 text-zinc-300";

  if (normalized.includes("high")) {
    className = "border-red-500/30 bg-red-500/10 text-red-400";
  } else if (normalized.includes("low")) {
    className = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  } else {
    className = "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {priority || "Medium"}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950/80 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
      {category}
    </span>
  );
}

function buildTicketDescription(ticket: SuggestedTicket): string {
  const sections: string[] = [];

  if (ticket.description?.trim()) {
    sections.push(ticket.description.trim());
  }
  if (ticket.business_impact?.trim()) {
    sections.push(`Business impact:\n${ticket.business_impact.trim()}`);
  }
  if (ticket.recommended_action?.trim()) {
    sections.push(`Recommended action:\n${ticket.recommended_action.trim()}`);
  }

  return sections.join("\n\n") || "Generated from GitHub repository analysis.";
}

type JiraPushState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; ticketKey: string; ticketUrl: string }
  | { status: "error"; message: string };

function JiraTicketCard({
  ticket,
  previewKey,
}: {
  ticket: SuggestedTicket;
  previewKey: string;
}) {
  const [pushState, setPushState] = useState<JiraPushState>({ status: "idle" });

  const isPushed = pushState.status === "success";
  const isLoading = pushState.status === "loading";

  return (
    <article className="rounded-lg border border-zinc-700 bg-zinc-950/80 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-xs font-medium text-blue-400">
            {isPushed ? pushState.ticketKey : previewKey}
          </p>
          <h3 className="text-sm font-semibold leading-snug text-zinc-100">
            {ticket.title || "Untitled task"}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {ticket.priority && <PriorityBadge priority={ticket.priority} />}
          {ticket.category && <CategoryBadge category={ticket.category} />}
        </div>
      </div>

      {ticket.business_impact && (
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Business impact
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">
            {ticket.business_impact}
          </p>
        </div>
      )}

      {ticket.recommended_action && (
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Recommended action
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {ticket.recommended_action}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
        {isPushed ? (
          <>
            <p className="text-sm text-emerald-400">Created in Jira</p>
            <a
              href={pushState.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-400 underline-offset-2 hover:underline"
            >
              Open {pushState.ticketKey} in Jira
            </a>
          </>
        ) : (
          <button
            type="button"
            disabled={isLoading}
            className="w-full rounded-lg border border-blue-500/50 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={async () => {
              if (!ticket.title?.trim()) {
                setPushState({
                  status: "error",
                  message: "Ticket title is required",
                });
                return;
              }

              setPushState({ status: "loading" });

              try {
                const response = await fetch(`${API_BASE}/api/create-jira-ticket`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: ticket.title,
                    description: buildTicketDescription(ticket),
                    priority: ticket.priority || "Medium",
                    category: ticket.category || "",
                  }),
                });

                const data = (await response.json()) as {
                  success?: boolean;
                  ticketKey?: string;
                  ticketUrl?: string;
                  error?: string;
                };

                if (!response.ok || !data.success || !data.ticketKey) {
                  setPushState({
                    status: "error",
                    message: data.error || "Failed to create Jira ticket",
                  });
                  return;
                }

                setPushState({
                  status: "success",
                  ticketKey: data.ticketKey,
                  ticketUrl: data.ticketUrl || "",
                });
              } catch {
                setPushState({
                  status: "error",
                  message: "Could not reach the server",
                });
              }
            }}
          >
            {isLoading ? "Pushing to Jira…" : "Push to Jira"}
          </button>
        )}

        {pushState.status === "error" && (
          <p className="text-sm text-red-400">{pushState.message}</p>
        )}
      </div>
    </article>
  );
}

function JiraTicketsPreview({
  tickets,
  repositoryName,
}: {
  tickets: SuggestedTicket[];
  repositoryName?: string;
}) {
  const projectPrefix =
    repositoryName?.split("/").pop()?.slice(0, 6).toUpperCase() || "REPO";

  return (
    <SectionCard title="Jira ticket preview">
      <p className="mb-4 text-sm text-zinc-400">
        Preview generated from your analysis. Use Push to Jira on each card to
        create issues manually (one at a time).
      </p>
      <div className="flex flex-col gap-3">
        {tickets.map((ticket, index) => (
          <JiraTicketCard
            key={index}
            ticket={ticket}
            previewKey={`${projectPrefix}-${index + 1}`}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ComplexityBadge({ level }: { level: string }) {
  const normalized = (level || "Medium").toLowerCase();
  let className =
    "border-zinc-600 bg-zinc-800/80 text-zinc-300";

  if (normalized.includes("low")) {
    className = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  } else if (normalized.includes("high")) {
    className = "border-red-500/30 bg-red-500/10 text-red-400";
  } else if (normalized.includes("medium")) {
    className = "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${className}`}
    >
      {level || "Medium"} complexity
    </span>
  );
}

function EngineeringScoreBar({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const barColor =
    clamped >= 71
      ? "bg-emerald-500"
      : clamped >= 41
        ? "bg-yellow-500"
        : "bg-red-500";
  const textColor =
    clamped >= 71
      ? "text-emerald-400"
      : clamped >= 41
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Engineering maturity
        </span>
        <span className={`text-2xl font-bold tabular-nums ${textColor}`}>
          {clamped}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

const TECH_LABELS: Record<string, string> = {
  frontendFramework: "Frontend",
  backendFramework: "Backend",
  database: "Data storage",
  authSystem: "Authentication",
  deploymentSetup: "Deployment",
  testingFramework: "Testing",
  stateManagement: "State management",
  apiLayerStructure: "API structure",
};

function RepoAnalysisReport({ data }: { data: RepoAnalysisResponse }) {
  const repo = data.repository;
  const exec = data.executive_summary;
  const analysis = data.analysis;
  const detected = data.techContext?.detected;

  const knownStack = detected
    ? Object.entries(detected).filter(([, value]) => value && value !== "unknown")
    : [];

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      {data.cached && (
        <p className="text-xs text-zinc-500">Loaded from recent analysis cache.</p>
      )}

      {repo && (
        <SectionCard title="Repository">
          <div className="space-y-2">
            <p className="text-base font-semibold text-zinc-100">
              {repo.name || "Unknown repository"}
            </p>
            {repo.description && (
              <TextBlock>{repo.description}</TextBlock>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
              {repo.language && <span>Primary language: {repo.language}</span>}
              {typeof repo.stars === "number" && (
                <span>{repo.stars.toLocaleString()} stars</span>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {exec && (
        <SectionCard title="Executive summary">
          <div className="flex flex-col gap-4">
            {exec.complexity_level && (
              <ComplexityBadge level={exec.complexity_level} />
            )}

            {exec.project_overview && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Project overview
                </p>
                <TextBlock>{exec.project_overview}</TextBlock>
              </div>
            )}

            {exec.stability_assessment && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Stability assessment
                </p>
                <TextBlock>{exec.stability_assessment}</TextBlock>
              </div>
            )}

            {exec.maintainability && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Maintainability
                </p>
                <TextBlock>{exec.maintainability}</TextBlock>
              </div>
            )}

            {exec.testing_maturity && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Testing maturity
                </p>
                <TextBlock>{exec.testing_maturity}</TextBlock>
              </div>
            )}

            {(exec.operational_risks?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Major operational risks
                </p>
                <BulletList
                  items={exec.operational_risks ?? []}
                  emptyLabel="No major risks identified."
                />
              </div>
            )}

            {(exec.recommended_priorities?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Recommended priorities
                </p>
                <BulletList
                  items={exec.recommended_priorities ?? []}
                  emptyLabel="No priorities suggested."
                />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {knownStack.length > 0 && (
        <SectionCard title="Technology snapshot">
          <ul className="grid gap-2 sm:grid-cols-2">
            {knownStack.map(([key, value]) => (
              <li
                key={key}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm"
              >
                <span className="text-xs text-zinc-500">
                  {TECH_LABELS[key] ?? key}
                </span>
                <p className="mt-0.5 font-medium text-zinc-100">{value}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {analysis && (
        <SectionCard title="Technical assessment">
          <div className="flex flex-col gap-4">
            {typeof analysis.engineeringScore === "number" && (
              <EngineeringScoreBar score={analysis.engineeringScore} />
            )}

            {analysis.summary && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Summary
                </p>
                <TextBlock>{analysis.summary}</TextBlock>
              </div>
            )}

            {(analysis.strengths?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Strengths
                </p>
                <BulletList
                  items={analysis.strengths ?? []}
                  emptyLabel="None noted."
                />
              </div>
            )}

            {(analysis.risks?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Technical risks
                </p>
                <BulletList items={analysis.risks ?? []} emptyLabel="None noted." />
              </div>
            )}

            {(analysis.recommendations?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Recommendations
                </p>
                <BulletList
                  items={analysis.recommendations ?? []}
                  emptyLabel="None noted."
                />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {!exec && !analysis && (
        <p className="text-sm text-zinc-500">
          Analysis completed, but no readable summary was returned. Try analyzing
          again.
        </p>
      )}
    </div>
  );
}

function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function GitHubRepoAnalyzer() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RepoAnalysisResponse | null>(null);
  const [showJiraTickets, setShowJiraTickets] = useState(false);
  const [jiraMessage, setJiraMessage] = useState<string | null>(null);

  const suggestedTickets = result?.analysis?.suggested_tickets ?? [];
  const hasSuggestedTickets = suggestedTickets.length > 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          GitHub Repo Analyzer
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Analyze a public GitHub repository for engineering maturity and risk signals
        </p>
      </div>

      <input
        type="url"
        placeholder="https://github.com/owner/repository"
        value={repoUrl}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        disabled={loading}
        onChange={(e) => {
          setError(null);
          setRepoUrl(e.target.value);
        }}
      />

      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={loading || !repoUrl.trim()}
        onClick={async () => {
          const normalized = normalizeRepoUrl(repoUrl);
          if (!normalized) {
            setError("Please enter a GitHub repository URL");
            return;
          }

          setLoading(true);
          setError(null);
          setResult(null);
          setShowJiraTickets(false);
          setJiraMessage(null);

          try {
            const response = await fetch(`${API_BASE}/api/analyze-repo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ repoUrl: normalized }),
            });

            const data = (await response.json()) as RepoAnalysisResponse;

            if (!response.ok) {
              setError(
                (data as { error?: string }).error || "Repository analysis failed"
              );
              return;
            }

            setResult(data);
          } catch {
            setError("Could not reach analysis server");
          } finally {
            setLoading(false);
          }
        }}
      >
        Analyze Repo
      </button>

      {loading && (
        <p className="mt-3 text-sm text-zinc-300">Analyzing repository…</p>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {!loading && result !== null && (
        <div className="mt-4 flex flex-col gap-4">
          <RepoAnalysisReport data={result} />

          <button
            type="button"
            className="w-full rounded-xl border border-blue-500/40 bg-blue-500/10 px-6 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasSuggestedTickets}
            onClick={() => {
              if (!hasSuggestedTickets) {
                setJiraMessage(
                  "No suggested tickets in this analysis. Re-run analysis after restarting the server with the latest ticket generator."
                );
                setShowJiraTickets(false);
                return;
              }
              setJiraMessage(null);
              setShowJiraTickets(true);
            }}
          >
            Generate Jira Tickets
          </button>

          {!hasSuggestedTickets && (
            <p className="text-xs text-zinc-500">
              Suggested tickets will appear here after analysis includes engineering
              task recommendations.
            </p>
          )}

          {jiraMessage && (
            <p className="text-sm text-amber-400">{jiraMessage}</p>
          )}

          {showJiraTickets && hasSuggestedTickets && (
            <JiraTicketsPreview
              tickets={suggestedTickets}
              repositoryName={result.repository?.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
