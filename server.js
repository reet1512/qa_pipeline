require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");
const { PDFParse } = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed"));
        }
    },
});

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const ANALYSIS_SCHEMA = `{
  "game_summary": "",
  "technical_feasibility": "",
  "development_risks": [],
  "qa_test_cases": [],
  "automation_possible_tests": [],
  "manual_tests_required": [],
  "deployment_readiness_score": 0
}`;

const FIELD_ALIASES = {
    game_summary: ["game_summary", "gameSummary", "summary", "overview"],
    technical_feasibility: [
        "technical_feasibility",
        "technicalFeasibility",
        "feasibility",
        "technical_feasibility_assessment",
    ],
    development_risks: ["development_risks", "developmentRisks", "risks", "technical_risks"],
    qa_test_cases: ["qa_test_cases", "qaTestCases", "test_cases", "testCases"],
    automation_possible_tests: [
        "automation_possible_tests",
        "automationPossibleTests",
        "automated_tests",
        "automation_tests",
    ],
    manual_tests_required: [
        "manual_tests_required",
        "manualTestsRequired",
        "manual_tests",
        "manualTests",
    ],
    deployment_readiness_score: [
        "deployment_readiness_score",
        "deploymentReadinessScore",
        "readiness_score",
        "deployment_score",
    ],
};

function coerceToString(value) {
    if (typeof value === "string") {
        return value.trim();
    }
    if (value == null) {
        return "";
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map(coerceToString).filter(Boolean).join("\n");
    }
    if (typeof value === "object") {
        return Object.entries(value)
            .map(([key, entry]) => `${key}: ${coerceToString(entry)}`)
            .join("\n");
    }
    return String(value).trim();
}

function normalizeStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") {
                    return item.trim();
                }
                if (item && typeof item === "object") {
                    const label =
                        item.test_case ||
                        item.title ||
                        item.name ||
                        item.risk ||
                        item.test ||
                        item.summary;
                    const detail = item.description || item.details;
                    if (label && detail) {
                        return `${label}: ${detail}`;
                    }
                    return coerceToString(item);
                }
                if (item == null) {
                    return "";
                }
                return String(item).trim();
            })
            .filter(Boolean);
    }

    if (value && typeof value === "object") {
        return Object.entries(value).map(
            ([key, entry]) => `${key}: ${coerceToString(entry)}`
        );
    }

    if (typeof value === "string" && value.trim()) {
        return [value.trim()];
    }

    return [];
}

function pickField(source, aliases) {
    for (const key of aliases) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            return source[key];
        }
    }
    return undefined;
}

function unwrapAnalysisObject(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
    }

    const nestedKeys = ["analysis", "result", "data", "output", "response"];
    for (const key of nestedKeys) {
        const nested = parsed[key];
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            return nested;
        }
    }

    return parsed;
}

function parseAnalysisResponse(raw) {
    const trimmed = raw.trim();
    const unfenced = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const parsed = JSON.parse(unfenced);
    const source = unwrapAnalysisObject(parsed);

    const scoreRaw = pickField(source, FIELD_ALIASES.deployment_readiness_score);

    const clampScore = (value) =>
        Math.min(100, Math.max(0, Number(value) || 0));

    const repoSummaryAliases = ["repo_summary", "repoSummary", "repository_summary"];
    const scoresAliases = ["scores", "quality_scores", "score_breakdown"];
    const criticalIssuesAliases = [
        "critical_issues",
        "criticalIssues",
        "critical_findings",
    ];
    const recommendationsAliases = [
        "recommendations",
        "recommended_actions",
        "suggestions",
    ];
    const missingBestPracticesAliases = [
        "missing_best_practices",
        "missingBestPractices",
        "best_practice_gaps",
    ];

    const repoSummaryRaw = pickField(source, repoSummaryAliases);
    const scoresRaw = pickField(source, scoresAliases);

    const repoSummary =
        repoSummaryRaw && typeof repoSummaryRaw === "object" && !Array.isArray(repoSummaryRaw)
            ? {
                  framework: coerceToString(repoSummaryRaw.framework),
                  project_type: coerceToString(
                      repoSummaryRaw.project_type ?? repoSummaryRaw.projectType
                  ),
                  architecture: coerceToString(repoSummaryRaw.architecture),
                  deployment_readiness: clampScore(
                      repoSummaryRaw.deployment_readiness ??
                          repoSummaryRaw.deploymentReadiness
                  ),
                  risk_level: coerceToString(
                      repoSummaryRaw.risk_level ?? repoSummaryRaw.riskLevel
                  ) || "UNKNOWN",
              }
            : {
                  framework: "",
                  project_type: "",
                  architecture: "",
                  deployment_readiness: 0,
                  risk_level: "UNKNOWN",
              };

    const scores =
        scoresRaw && typeof scoresRaw === "object" && !Array.isArray(scoresRaw)
            ? {
                  security: clampScore(scoresRaw.security),
                  performance: clampScore(scoresRaw.performance),
                  maintainability: clampScore(scoresRaw.maintainability),
                  deployment: clampScore(scoresRaw.deployment),
                  testing: clampScore(scoresRaw.testing),
              }
            : {
                  security: 0,
                  performance: 0,
                  maintainability: 0,
                  deployment: 0,
                  testing: 0,
              };

    return {
        game_summary: coerceToString(
            pickField(source, FIELD_ALIASES.game_summary)
        ),
        technical_feasibility: coerceToString(
            pickField(source, FIELD_ALIASES.technical_feasibility)
        ),
        development_risks: normalizeStringArray(
            pickField(source, FIELD_ALIASES.development_risks)
        ),
        qa_test_cases: normalizeStringArray(
            pickField(source, FIELD_ALIASES.qa_test_cases)
        ),
        automation_possible_tests: normalizeStringArray(
            pickField(source, FIELD_ALIASES.automation_possible_tests)
        ),
        manual_tests_required: normalizeStringArray(
            pickField(source, FIELD_ALIASES.manual_tests_required)
        ),
        deployment_readiness_score: clampScore(scoreRaw),
        repo_summary: repoSummary,
        scores,
        critical_issues: normalizeStringArray(
            pickField(source, criticalIssuesAliases)
        ),
        recommendations: normalizeStringArray(
            pickField(source, recommendationsAliases)
        ),
        missing_best_practices: normalizeStringArray(
            pickField(source, missingBestPracticesAliases)
        ),
    };
}

// --- GitHub repo analyzer (isolated from GDD / parseAnalysisResponse) ---

const REPO_ANALYSIS_CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes (within 5–10 min range)
const repoAnalysisCache = new Map();

const REPO_CONFIG_FILE_PATHS = [
    "package.json",
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "vercel.json",
    "fly.toml",
];

const MONOREPO_PACKAGE_JSON_PATHS = [
    "packages/ui/package.json",
    "packages/api/package.json",
    "packages/server/package.json",
    "apps/web/package.json",
    "apps/api/package.json",
    "frontend/package.json",
    "backend/package.json",
    "api/package.json",
];

function normalizeRepoUrlInput(url) {
    let value = String(url).trim();
    if (!value) {
        return "";
    }

    const sshMatch = value.match(
        /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i
    );
    if (sshMatch) {
        const owner = sshMatch[1];
        const repo = sshMatch[2].replace(/\.git$/i, "");
        return `https://github.com/${owner}/${repo}`;
    }

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        const shorthand = value.replace(/^\/+/, "").replace(/\/+$/, "");
        value = `https://github.com/${shorthand}`;
    }

    try {
        const parsed = new URL(value);
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (host !== "github.com") {
            return value.replace(/\/+$/, "");
        }

        const segments = parsed.pathname.split("/").filter(Boolean).slice(0, 2);
        if (segments.length < 2) {
            return value.replace(/\/+$/, "");
        }

        const owner = segments[0];
        const repo = segments[1].replace(/\.git$/i, "");
        return `https://github.com/${owner}/${repo}`;
    } catch {
        return value.replace(/\/+$/, "").replace(/\.git\/?$/i, "");
    }
}

function isValidGithubNameSegment(segment) {
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/.test(
        segment
    );
}

function parseGithubRepoUrl(repoUrl) {
    const canonicalUrl = normalizeRepoUrlInput(repoUrl);
    if (!canonicalUrl) {
        return null;
    }

    try {
        const parsed = new URL(canonicalUrl);
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

        if (host !== "github.com") {
            return null;
        }

        const segments = parsed.pathname.split("/").filter(Boolean).slice(0, 2);
        if (segments.length < 2) {
            return null;
        }

        const owner = decodeURIComponent(segments[0]);
        const repo = decodeURIComponent(segments[1].replace(/\.git$/i, ""));

        if (!owner || !repo || !isValidGithubNameSegment(owner) || !isValidGithubNameSegment(repo)) {
            return null;
        }

        const identifier = `${owner}/${repo}`;

        return {
            owner,
            repo,
            identifier,
            canonicalUrl: `https://github.com/${identifier}`,
            normalized: `https://github.com/${identifier}`,
        };
    } catch {
        return null;
    }
}

function getRepoCacheKey(repoUrl) {
    const parsed = parseGithubRepoUrl(repoUrl);
    return (parsed?.identifier || parsed?.canonicalUrl || "").toLowerCase();
}

function getRepoAnalysisCache(cacheKey) {
    const entry = repoAnalysisCache.get(cacheKey);
    if (!entry) {
        return null;
    }
    if (Date.now() > entry.expiresAt) {
        repoAnalysisCache.delete(cacheKey);
        return null;
    }
    return entry.payload;
}

function setRepoAnalysisCache(cacheKey, payload) {
    repoAnalysisCache.set(cacheKey, {
        expiresAt: Date.now() + REPO_ANALYSIS_CACHE_TTL_MS,
        payload,
    });
}

function githubApiHeaders() {
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "leanspec-repo-analyzer",
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

async function fetchRepoFileContent(owner, repo, path, branch, headers) {
    try {
        const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref}`,
            { headers }
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        if (!data || data.type !== "file" || !data.content) {
            return null;
        }

        return Buffer.from(data.content, "base64")
            .toString("utf8")
            .slice(0, 12000);
    } catch {
        return null;
    }
}

async function listRepoDirectoryNames(owner, repo, path, branch, headers) {
    try {
        const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
        const segment = path ? `${path}/` : "";
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${segment}${ref}`,
            { headers }
        );

        if (!response.ok) {
            return [];
        }

        const entries = await response.json();
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries
            .filter((entry) => entry.type === "dir")
            .map((entry) => entry.name)
            .slice(0, 40);
    } catch {
        return [];
    }
}

function parsePackageJsonDependencies(text, sourcePath) {
    try {
        const parsed = JSON.parse(text);
        const buckets = [
            parsed.dependencies,
            parsed.devDependencies,
            parsed.peerDependencies,
            parsed.optionalDependencies,
        ];

        const names = [];
        for (const bucket of buckets) {
            if (bucket && typeof bucket === "object") {
                names.push(...Object.keys(bucket));
            }
        }

        return { names, sourcePath };
    } catch {
        return { names: [], sourcePath };
    }
}

function parseRequirementsDependencies(text) {
    const names = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
        if (match) {
            names.push(match[1].toLowerCase());
        }
    }
    return names;
}

function parsePyprojectDependencyNames(text) {
    const names = new Set();
    const dependencyBlocks = text.match(
        /\[project\.optional-dependencies\][\s\S]*?(?=\n\[|$)|\[project\.dependencies\][\s\S]*?(?=\n\[|$)|dependencies\s*=\s*\[[\s\S]*?\]/gi
    );

    if (dependencyBlocks) {
        for (const block of dependencyBlocks) {
            const quoted = block.match(/"([a-zA-Z0-9_.-]+)"/g) || [];
            for (const item of quoted) {
                names.add(item.replace(/"/g, "").toLowerCase());
            }
        }
    }

    const inlineDeps = text.match(/^\s*["']([a-zA-Z0-9_.-]+)["']\s*=/gm) || [];
    for (const item of inlineDeps) {
        const match = item.match(/["']([a-zA-Z0-9_.-]+)["']/);
        if (match) {
            names.add(match[1].toLowerCase());
        }
    }

    return [...names];
}

function collectDependencyKeywords(signals) {
    const keywords = new Set();

    for (const pkg of signals.packageJsonFiles) {
        for (const name of pkg.names) {
            keywords.add(name.toLowerCase());
        }
    }

    for (const name of signals.requirementsPackages) {
        keywords.add(name.toLowerCase());
    }

    for (const name of signals.pyprojectPackages) {
        keywords.add(name.toLowerCase());
    }

    return [...keywords].sort();
}

function buildSearchCorpus(signals) {
    const chunks = [
        signals.readmeExcerpt || "",
        ...signals.packageJsonFiles.map((pkg) => pkg.rawExcerpt || ""),
        signals.requirementsText || "",
        signals.pyprojectText || "",
        signals.dockerfileText || "",
        signals.dockerComposeText || "",
        ...(signals.configFilesFound || []),
        ...signals.folderNames,
        ...signals.rootFolderNames,
        ...collectDependencyKeywords(signals),
    ];

    return chunks.join("\n").toLowerCase();
}

function detectFromRules(corpus, folderNames, rules) {
    const folderSet = new Set(folderNames.map((name) => name.toLowerCase()));
    let best = { label: "unknown", confidence: "low", evidence: [] };

    for (const rule of rules) {
        const evidence = [];

        for (const keyword of rule.keywords) {
            if (corpus.includes(keyword.toLowerCase())) {
                evidence.push(`dependency: ${keyword}`);
            }
        }

        for (const folder of rule.folders || []) {
            if (folderSet.has(folder.toLowerCase())) {
                evidence.push(`folder: ${folder}`);
            }
        }

        if (evidence.length === 0) {
            continue;
        }

        const confidence =
            evidence.some((item) => item.startsWith("dependency:")) &&
            evidence.some((item) => item.startsWith("folder:"))
                ? "high"
                : evidence.length >= 2
                  ? "medium"
                  : "low";

        if (
            best.label === "unknown" ||
            (confidence === "high" && best.confidence !== "high") ||
            evidence.length > best.evidence.length
        ) {
            best = { label: rule.label, confidence, evidence };
        }
    }

    return best;
}

const TECH_DETECTION_RULES = {
    frontendFramework: [
        { label: "React", keywords: ["react", "react-dom", "vite", "next"] },
        { label: "Vue", keywords: ["vue", "nuxt", "@nuxt/"] },
        { label: "Angular", keywords: ["@angular/core", "angular"] },
        { label: "Svelte", keywords: ["svelte", "@sveltejs/"] },
    ],
    backendFramework: [
        { label: "Express", keywords: ["express"], folders: ["server", "api"] },
        { label: "Fastify", keywords: ["fastify"] },
        { label: "NestJS", keywords: ["@nestjs/core", "nestjs"] },
        { label: "Django", keywords: ["django"] },
        { label: "Flask", keywords: ["flask"] },
        { label: "FastAPI", keywords: ["fastapi", "uvicorn"] },
    ],
    database: [
        { label: "PostgreSQL", keywords: ["pg", "postgres", "postgresql", "prisma"] },
        { label: "MongoDB", keywords: ["mongoose", "mongodb"] },
        { label: "MySQL", keywords: ["mysql2", "mysql"] },
        { label: "SQLite", keywords: ["sqlite3", "better-sqlite3"] },
        { label: "Redis", keywords: ["redis", "ioredis"] },
        { label: "Supabase", keywords: ["@supabase/supabase-js", "supabase"] },
    ],
    authSystem: [
        { label: "NextAuth", keywords: ["next-auth", "@auth/core"] },
        { label: "Passport", keywords: ["passport", "passport-jwt"] },
        { label: "Clerk", keywords: ["@clerk/", "clerk"] },
        { label: "Firebase Auth", keywords: ["firebase/auth", "firebase-admin"] },
        { label: "JWT", keywords: ["jsonwebtoken", "jose"] },
    ],
    deploymentSetup: [
        { label: "Docker", keywords: ["dockerfile", "from node", "from python"], folders: ["docker"] },
        { label: "Docker Compose", keywords: ["docker-compose", "services:"] },
        { label: "Vercel", keywords: ["vercel.json", "vercel"] },
        { label: "GitHub Actions", keywords: ["github/workflows"], folders: [".github"] },
        { label: "Fly.io", keywords: ["fly.toml"] },
    ],
    testingFramework: [
        { label: "Vitest", keywords: ["vitest"] },
        { label: "Jest", keywords: ["jest", "@testing-library/"] },
        { label: "Playwright", keywords: ["playwright", "@playwright/test"] },
        { label: "Cypress", keywords: ["cypress"] },
        { label: "Pytest", keywords: ["pytest"] },
        { label: "Mocha", keywords: ["mocha"] },
    ],
    stateManagement: [
        { label: "Zustand", keywords: ["zustand"] },
        { label: "Redux", keywords: ["redux", "@reduxjs/toolkit"] },
        { label: "MobX", keywords: ["mobx"] },
        { label: "Jotai", keywords: ["jotai"] },
        { label: "Pinia", keywords: ["pinia"] },
        { label: "Vuex", keywords: ["vuex"] },
    ],
    apiLayerStructure: [
        { label: "GraphQL", keywords: ["graphql", "@apollo/server", "apollo-server"] },
        { label: "tRPC", keywords: ["@trpc/server", "trpc"] },
        { label: "REST", keywords: ["express", "fastify", "openapi", "swagger"], folders: ["routes", "controllers", "api"] },
        { label: "gRPC", keywords: ["grpc", "@grpc/grpc-js"] },
    ],
};

function buildRepositoryTechContext(signals) {
    const corpus = buildSearchCorpus(signals);
    const folderNames = [...signals.rootFolderNames, ...signals.folderNames];
    const detected = {};
    const evidence = {};
    const confidence = {};

    for (const [field, rules] of Object.entries(TECH_DETECTION_RULES)) {
        const match = detectFromRules(corpus, folderNames, rules);
        detected[field] = match.label;
        evidence[field] = match.evidence;
        confidence[field] = match.confidence;
    }

    return {
        detected,
        evidence,
        confidence,
        rawSources: {
            packageJsonPaths: signals.packageJsonFiles.map((pkg) => pkg.sourcePath),
            configFilesFound: signals.configFilesFound,
            folderNames,
            dependencyKeywords: collectDependencyKeywords(signals),
        },
        extractionNotes: signals.extractionNotes,
    };
}

async function collectRepositorySignals(owner, repo, defaultBranch, readmeExcerpt) {
    const headers = githubApiHeaders();
    const extractionNotes = [];
    const configFilesFound = [];
    const packageJsonFiles = [];

    const filePaths = [
        ...new Set([...REPO_CONFIG_FILE_PATHS, ...MONOREPO_PACKAGE_JSON_PATHS]),
    ].slice(0, 14);

    const fileResults = await Promise.all(
        filePaths.map(async (path) => ({
            path,
            content: await fetchRepoFileContent(owner, repo, path, defaultBranch, headers),
        }))
    );

    let requirementsText = "";
    let pyprojectText = "";
    let dockerfileText = "";
    let dockerComposeText = "";
    const requirementsPackages = [];

    for (const { path, content } of fileResults) {
        if (!content) {
            continue;
        }

        configFilesFound.push(path);

        if (path.endsWith("package.json")) {
            const parsed = parsePackageJsonDependencies(content, path);
            packageJsonFiles.push({
                sourcePath: path,
                names: parsed.names,
                rawExcerpt: content.slice(0, 4000),
            });
        } else if (path === "requirements.txt" || path === "requirements-dev.txt") {
            requirementsText += `\n${content}`;
            requirementsPackages.push(...parseRequirementsDependencies(content));
        } else if (path === "pyproject.toml") {
            pyprojectText = content;
        } else if (path === "Dockerfile") {
            dockerfileText = content;
        } else if (path.startsWith("docker-compose")) {
            dockerComposeText += `\n${content}`;
        }
    }

    const rootFolderNames = await listRepoDirectoryNames(
        owner,
        repo,
        "",
        defaultBranch,
        headers
    );

    let folderNames = [];
    if (rootFolderNames.includes("packages")) {
        folderNames = await listRepoDirectoryNames(
            owner,
            repo,
            "packages",
            defaultBranch,
            headers
        );
        folderNames = folderNames.map((name) => `packages/${name}`);
    } else if (rootFolderNames.includes("apps")) {
        folderNames = await listRepoDirectoryNames(
            owner,
            repo,
            "apps",
            defaultBranch,
            headers
        );
        folderNames = folderNames.map((name) => `apps/${name}`);
    }

    if (configFilesFound.length === 0 && rootFolderNames.length === 0) {
        extractionNotes.push("Limited repository files were accessible via GitHub API");
    }

    return {
        readmeExcerpt,
        packageJsonFiles,
        requirementsText: requirementsText.trim(),
        requirementsPackages: [...new Set(requirementsPackages)],
        pyprojectText,
        pyprojectPackages: pyprojectText
            ? parsePyprojectDependencyNames(pyprojectText)
            : [],
        dockerfileText,
        dockerComposeText: dockerComposeText.trim(),
        rootFolderNames,
        folderNames,
        configFilesFound,
        extractionNotes,
    };
}

async function fetchGithubRepoContext(owner, repo) {
    const headers = githubApiHeaders();

    const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
    );

    if (repoResponse.status === 404) {
        return { error: "Repository not found", status: 404 };
    }

    if (!repoResponse.ok) {
        return {
            error: "Failed to fetch repository from GitHub",
            status: repoResponse.status,
        };
    }

    const repoData = await repoResponse.json();

    let readmeExcerpt = "";
    try {
        const readmeResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/readme`,
            { headers }
        );

        if (readmeResponse.ok) {
            const readmeData = await readmeResponse.json();
            readmeExcerpt = Buffer.from(readmeData.content || "", "base64")
                .toString("utf8")
                .trim()
                .slice(0, 6000);
        }
    } catch {
        readmeExcerpt = "";
    }

    return {
        repository: {
            name: repoData.full_name || `${owner}/${repo}`,
            description: coerceToString(repoData.description),
            stars: Number(repoData.stargazers_count) || 0,
            language: coerceToString(repoData.language),
        },
        contextForAi: {
            topics: Array.isArray(repoData.topics) ? repoData.topics : [],
            default_branch: repoData.default_branch || "",
            license: repoData.license?.spdx_id || "",
            open_issues: repoData.open_issues_count ?? 0,
            forks: repoData.forks_count ?? 0,
            size_kb: repoData.size ?? 0,
            created_at: repoData.created_at || "",
            updated_at: repoData.updated_at || "",
            has_wiki: Boolean(repoData.has_wiki),
            has_discussions: Boolean(repoData.has_discussions),
            readme_excerpt: readmeExcerpt,
        },
    };
}

const TICKET_CATEGORIES = [
    "Testing",
    "Security",
    "Deployment",
    "Architecture",
    "Validation",
];

function normalizeTicketPriority(value) {
    const normalized = coerceToString(value).toLowerCase();

    if (normalized.includes("high") || normalized.includes("critical")) {
        return "High";
    }
    if (normalized.includes("low")) {
        return "Low";
    }

    return "Medium";
}

function normalizeTicketCategory(value) {
    const normalized = coerceToString(value).toLowerCase();

    for (const category of TICKET_CATEGORIES) {
        if (normalized === category.toLowerCase()) {
            return category;
        }
    }

    if (normalized.includes("test")) {
        return "Testing";
    }
    if (normalized.includes("secur") || normalized.includes("auth")) {
        return "Security";
    }
    if (normalized.includes("deploy") || normalized.includes("release") || normalized.includes("ops")) {
        return "Deployment";
    }
    if (normalized.includes("valid") || normalized.includes("input")) {
        return "Validation";
    }
    if (normalized.includes("arch") || normalized.includes("struct")) {
        return "Architecture";
    }

    return "Architecture";
}

function parseSuggestedTickets(analysisSource, parsedRoot) {
    const rawTickets =
        analysisSource.suggested_tickets ??
        analysisSource.suggestedTickets ??
        parsedRoot.suggested_tickets ??
        parsedRoot.suggestedTickets;

    if (!Array.isArray(rawTickets)) {
        return [];
    }

    const tickets = [];

    for (const item of rawTickets.slice(0, 8)) {
        if (!item || typeof item !== "object") {
            continue;
        }

        const title = coerceToString(item.title ?? item.summary ?? item.name);
        if (!title) {
            continue;
        }

        tickets.push({
            title,
            priority: normalizeTicketPriority(item.priority ?? item.severity),
            category: normalizeTicketCategory(item.category ?? item.type ?? item.area),
            description: coerceToString(item.description ?? item.details),
            business_impact: coerceToString(
                item.business_impact ?? item.businessImpact ?? item.impact
            ),
            recommended_action: coerceToString(
                item.recommended_action ??
                    item.recommendedAction ??
                    item.action
            ),
        });

        if (tickets.length >= 6) {
            break;
        }
    }

    return tickets;
}

function normalizeComplexityLevel(value) {
    const normalized = coerceToString(value).toLowerCase();

    if (normalized.includes("high")) {
        return "High";
    }
    if (normalized.includes("medium") || normalized.includes("moderate")) {
        return "Medium";
    }
    if (normalized.includes("low")) {
        return "Low";
    }

    return "Medium";
}

function parseExecutiveSummary(parsed) {
    const exec =
        parsed.executive_summary &&
        typeof parsed.executive_summary === "object" &&
        !Array.isArray(parsed.executive_summary)
            ? parsed.executive_summary
            : {};

    return {
        project_overview: coerceToString(
            exec.project_overview ?? exec.projectOverview
        ),
        complexity_level: normalizeComplexityLevel(
            exec.complexity_level ?? exec.complexityLevel
        ),
        stability_assessment: coerceToString(
            exec.stability_assessment ?? exec.stabilityAssessment
        ),
        operational_risks: normalizeStringArray(
            exec.operational_risks ?? exec.operationalRisks
        ),
        maintainability: coerceToString(
            exec.maintainability ?? exec.maintainability_assessment
        ),
        testing_maturity: coerceToString(
            exec.testing_maturity ?? exec.testingMaturity
        ),
        recommended_priorities: normalizeStringArray(
            exec.recommended_priorities ??
                exec.recommendedPriorities ??
                exec.improvement_priorities
        ),
    };
}

function parseRepoAnalysisResponse(raw) {
    const trimmed = raw.trim();
    const unfenced = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const parsed = JSON.parse(unfenced);
    const analysisSource =
        parsed.analysis && typeof parsed.analysis === "object" && !Array.isArray(parsed.analysis)
            ? parsed.analysis
            : parsed;

    const scoreRaw =
        analysisSource.engineeringScore ?? analysisSource.engineering_score;

    const suggested_tickets = parseSuggestedTickets(analysisSource, parsed);

    return {
        analysis: {
            summary: coerceToString(analysisSource.summary),
            strengths: normalizeStringArray(analysisSource.strengths),
            risks: normalizeStringArray(analysisSource.risks),
            recommendations: normalizeStringArray(analysisSource.recommendations),
            engineeringScore: Math.min(100, Math.max(0, Number(scoreRaw) || 0)),
            suggested_tickets,
        },
        executive_summary: parseExecutiveSummary(parsed),
    };
}

// --- Jira integration (isolated; credentials server-side only) ---

function getJiraConfig() {
    const baseUrl = (process.env.JIRA_BASE_URL || "").trim().replace(/\/+$/, "");
    const email = (process.env.JIRA_EMAIL || "").trim();
    const apiToken = (process.env.JIRA_API_TOKEN || "").trim();
    const projectKey = (process.env.JIRA_PROJECT_KEY || "").trim();

    if (!baseUrl || !email || !apiToken || !projectKey) {
        return null;
    }

    return { baseUrl, email, apiToken, projectKey };
}

function mapJiraPriorityName(priority) {
    const normalized = coerceToString(priority).toLowerCase();

    if (normalized.includes("high")) {
        return "High";
    }
    if (normalized.includes("low")) {
        return "Low";
    }

    return "Medium";
}

function buildJiraAdfDescription(text) {
    const body = coerceToString(text) || "No description provided.";
    const blocks = body.split(/\n\n+/).filter(Boolean);

    const content =
        blocks.length > 0
            ? blocks.map((block) => ({
                  type: "paragraph",
                  content: [{ type: "text", text: block.replace(/\n/g, " ") }],
              }))
            : [
                  {
                      type: "paragraph",
                      content: [{ type: "text", text: body }],
                  },
              ];

    return {
        type: "doc",
        version: 1,
        content,
    };
}

async function createJiraTaskIssue({ title, description, priority, category }) {
    const config = getJiraConfig();
    if (!config) {
        return {
            error: "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY.",
            status: 503,
        };
    }

    const summary = coerceToString(title).slice(0, 255);
    if (!summary) {
        return { error: "title is required", status: 400 };
    }

    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString(
        "base64"
    );

    const fields = {
        project: { key: config.projectKey },
        summary,
        issuetype: { name: "Task" },
        description: buildJiraAdfDescription(description),
        priority: { name: mapJiraPriorityName(priority) },
    };

    const label = coerceToString(category).replace(/\s+/g, "");
    if (label) {
        fields.labels = [label];
    }

    try {
        const response = await fetch(`${config.baseUrl}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message =
                (Array.isArray(data.errorMessages) && data.errorMessages[0]) ||
                (data.errors &&
                    Object.values(data.errors).find((v) => typeof v === "string")) ||
                data.message ||
                `Jira API returned status ${response.status}`;

            console.error("Jira create issue failed:", response.status, message);

            return {
                error: message,
                status: response.status >= 500 ? 502 : 400,
            };
        }

        const ticketKey = data.key;
        if (!ticketKey) {
            console.error("Jira create issue failed: missing issue key in response");
            return { error: "Jira did not return a ticket key", status: 502 };
        }

        return {
            success: true,
            ticketKey,
            ticketUrl: `${config.baseUrl}/browse/${ticketKey}`,
        };
    } catch (err) {
        console.error("Jira create issue error:", err.message);
        return { error: "Failed to reach Jira API", status: 502 };
    }
}

app.get("/", (_req, res) => {
    res.json({ ok: true });
});

app.post("/api/analyze-repo", async (req, res) => {
    try {
        const { repoUrl } = req.body || {};

        if (!repoUrl || typeof repoUrl !== "string") {
            return res.status(400).json({
                success: false,
                error: "repoUrl is required",
            });
        }

        const parsedRepo = parseGithubRepoUrl(repoUrl);
        if (!parsedRepo) {
            return res.status(400).json({
                success: false,
                error: "Invalid GitHub repository URL",
            });
        }

        const cacheKey = getRepoCacheKey(parsedRepo.normalized);
        const cached = getRepoAnalysisCache(cacheKey);
        if (cached) {
            console.log("repo analysis cache hit:", cacheKey);
            return res.json({
                ...cached,
                cached: true,
            });
        }

        const github = await fetchGithubRepoContext(parsedRepo.owner, parsedRepo.repo);
        if (github.error) {
            const status = github.status === 404 ? 404 : 502;
            return res.status(status).json({
                success: false,
                error: github.error,
            });
        }

        const fileSignals = await collectRepositorySignals(
            parsedRepo.owner,
            parsedRepo.repo,
            github.contextForAi.default_branch || "main",
            github.contextForAi.readme_excerpt
        );

        const repositorySignals = {
            ...github.contextForAi,
            configFilesFound: fileSignals.configFilesFound,
            rootFolderNames: fileSignals.rootFolderNames,
            workspaceFolderNames: fileSignals.folderNames,
            dependencyKeywords: collectDependencyKeywords(fileSignals),
            extractionNotes: fileSignals.extractionNotes,
        };

        const techContext = buildRepositoryTechContext(fileSignals);

        const completion = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a senior software engineering auditor analyzing GitHub repositories. Respond ONLY with valid JSON. Output JSON only — no markdown, no code fences, no extra text.

Return a single JSON object with TWO top-level keys: "analysis" and "executive_summary".

"analysis" (technical, engineering-accurate):
- summary (string): concise engineering assessment
- strengths (string array)
- risks (string array): scalability, maintainability, onboarding, missing docs/tests
- recommendations (string array)
- engineeringScore (integer 0-100): overall engineering maturity
- suggested_tickets (array of 3-6 objects): realistic engineering task recommendations (not Jira integration)

Each suggested_tickets item must include:
- title (string): concise actionable task title
- priority (string): exactly "Low", "Medium", or "High"
- category (string): exactly one of "Testing", "Security", "Deployment", "Architecture", "Validation"
- description (string): what should be investigated or improved
- business_impact (string): why this matters in business terms
- recommended_action (string): practical next step the team can take

Ticket generation rules:
- Generate 3-6 tickets grounded in observed risks, testing gaps, deployment concerns, validation gaps, maintainability, architecture complexity, and operational risks
- Sound like real engineering backlog items; be concise and actionable
- Use cautious language when evidence is limited (e.g., "Review", "Assess", "Add coverage for")
- Do NOT claim specific files/modules are broken unless explicitly supported by signals
- Do NOT hallucinate implementation details (avoid "Fix broken JWT middleware"; prefer "Add integration tests for authentication workflows")
- Do NOT use fake certainty

"executive_summary" (non-technical, business-readable):
- project_overview (string): simple explanation of what this project appears to be and who it serves
- complexity_level (string): exactly one of "Low", "Medium", or "High" for overall system complexity
- stability_assessment (string): plain-language reliability and operational stability outlook
- operational_risks (string array): major business/operational risks in accessible language
- maintainability (string): how easy the system appears to maintain and evolve over time
- testing_maturity (string): quality assurance and testing readiness in plain language
- recommended_priorities (string array): top improvement priorities for leadership (ordered, most important first)

Executive writing rules:
- Professional, concise, executive-friendly, trustworthy, not alarmist
- Avoid excessive jargon; translate technical findings into business impact
- Do NOT name specific libraries unless necessary; describe capabilities and tradeoffs instead
- Example style: prefer "The system depends on multiple backend services, which improves scalability but increases deployment complexity" over "Uses PostgreSQL and Redis"
- Example style: prefer "Some user input protection mechanisms may be incomplete, increasing the risk of unexpected application behavior" over "Missing validation middleware"
- Reflect deployment and release readiness inside stability_assessment and maintainability when relevant

Use repositoryTechContext.detected values as heuristic hints (not ground truth). When confidence is low or value is "unknown", acknowledge uncertainty without overstating conclusions.`,
                },
                {
                    role: "user",
                    content: `Analyze this GitHub repository and return JSON with both "analysis" and "executive_summary" objects.

Repository metadata:
${JSON.stringify(github.repository, null, 2)}

Repository signals:
${JSON.stringify(repositorySignals, null, 2)}

Repository tech context (heuristic):
${JSON.stringify(techContext, null, 2)}

Required JSON shape:
{
  "analysis": {
    "summary": "",
    "strengths": [],
    "risks": [],
    "recommendations": [],
    "engineeringScore": 0,
    "suggested_tickets": [
      {
        "title": "",
        "priority": "Low | Medium | High",
        "category": "Testing | Security | Deployment | Architecture | Validation",
        "description": "",
        "business_impact": "",
        "recommended_action": ""
      }
    ]
  },
  "executive_summary": {
    "project_overview": "",
    "complexity_level": "Low | Medium | High",
    "stability_assessment": "",
    "operational_risks": [],
    "maintainability": "",
    "testing_maturity": "",
    "recommended_priorities": []
  }
}`,
                },
            ],
        });

        const rawGroqResponse = completion.choices[0].message.content || "";
        console.log("raw repo Groq response:", rawGroqResponse.slice(0, 500));

        let parsedResponse;
        try {
            parsedResponse = parseRepoAnalysisResponse(rawGroqResponse);
        } catch {
            return res.status(500).json({
                success: false,
                error: "Invalid AI response format",
            });
        }

        const payload = {
            success: true,
            repository: github.repository,
            repositorySignals,
            techContext,
            analysis: parsedResponse.analysis,
            executive_summary: parsedResponse.executive_summary,
        };

        setRepoAnalysisCache(cacheKey, payload);

        res.json(payload);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Repository analysis failed",
        });
    }
});

app.post("/api/create-jira-ticket", async (req, res) => {
    try {
        const { title, description, priority, category } = req.body || {};

        if (!title || typeof title !== "string") {
            return res.status(400).json({
                success: false,
                error: "title is required",
            });
        }

        const result = await createJiraTaskIssue({
            title,
            description:
                typeof description === "string" ? description : "",
            priority: typeof priority === "string" ? priority : "Medium",
            category: typeof category === "string" ? category : "",
        });

        if (result.error) {
            return res.status(result.status || 500).json({
                success: false,
                error: result.error,
            });
        }

        res.json({
            success: true,
            ticketKey: result.ticketKey,
            ticketUrl: result.ticketUrl,
        });
    } catch (error) {
        console.error("Jira ticket route error:", error.message);

        res.status(500).json({
            success: false,
            error: "Failed to create Jira ticket",
        });
    }
});

app.post("/api/analyze", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No PDF uploaded",
            });
        }

        const parser = new PDFParse({ data: req.file.buffer });
        const pdfData = await parser.getText();
        const pageText = Array.isArray(pdfData.pages)
            ? pdfData.pages.map((page) => page.text).join("\n")
            : "";
        const extractedText = (pdfData.text || pageText).trim().slice(0, 8000);

        console.log("extracted PDF text:", extractedText.slice(0, 500));
        console.log("extracted PDF text length:", extractedText.length);

        if (!extractedText) {
            return res.status(400).json({
                success: false,
                error: "Could not extract text from PDF",
            });
        }

        const completion = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a senior game QA analyst. Respond ONLY with valid JSON. Return a valid JSON object as the entire reply. Output JSON only — no markdown, no code fences, no wrapper objects, no extra text before or after the JSON.

Your JSON response must be a single top-level JSON object with every required key populated. All JSON array fields must be JSON arrays of strings. deployment_readiness_score must be a JSON integer from 0 to 100. repo_summary and scores must be nested JSON objects with the shapes described in the user message.`,
                },
                {
                    role: "user",
                    content: `Analyze this Game Design Document and generate a valid JSON response. Return one valid JSON object only — no markdown, no prose outside the JSON.

Populate every required top-level JSON key with concrete content from the GDD:

Required JSON keys:
- game_summary (JSON string)
- technical_feasibility (JSON string)
- development_risks (JSON string array)
- qa_test_cases (JSON string array)
- automation_possible_tests (JSON string array)
- manual_tests_required (JSON string array)
- deployment_readiness_score (JSON integer 0-100)
- repo_summary (JSON object)
- scores (JSON object)
- critical_issues (JSON string array)
- recommendations (JSON string array)
- missing_best_practices (JSON string array)

repo_summary JSON object:
{
  "framework": "",
  "project_type": "",
  "architecture": "",
  "deployment_readiness": 0,
  "risk_level": ""
}

scores JSON object:
{
  "security": 0,
  "performance": 0,
  "maintainability": 0,
  "deployment": 0,
  "testing": 0
}

GDD:
${extractedText}`,
                },
            ],
        });

        const rawGroqResponse = completion.choices[0].message.content || "";
        console.log("raw Groq response:", rawGroqResponse);

        let analysis;
        try {
            analysis = parseAnalysisResponse(rawGroqResponse);
        } catch {
            return res.status(500).json({
                success: false,
                error: "Invalid AI response format",
            });
        }

        console.log("parsed analysis:", analysis);
        console.log("FINAL ANALYSIS OBJECT:", analysis);

        res.json({
            success: true,
            ...analysis,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "AI analysis failed",
        });
    }
});

app.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError || err.message === "Only PDF files are allowed") {
        return res.status(400).json({
            success: false,
            error: err.message,
        });
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
