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

    return {
        game_summary: coerceToString(pickField(source, FIELD_ALIASES.game_summary)),
        technical_feasibility: coerceToString(
            pickField(source, FIELD_ALIASES.technical_feasibility)
        ),
        development_risks: normalizeStringArray(pickField(source, FIELD_ALIASES.development_risks)),
        qa_test_cases: normalizeStringArray(pickField(source, FIELD_ALIASES.qa_test_cases)),
        automation_possible_tests: normalizeStringArray(
            pickField(source, FIELD_ALIASES.automation_possible_tests)
        ),
        manual_tests_required: normalizeStringArray(
            pickField(source, FIELD_ALIASES.manual_tests_required)
        ),
        deployment_readiness_score: Math.min(
            100,
            Math.max(0, Number(scoreRaw) || 0)
        ),
    };
}

app.get("/", (_req, res) => {
    res.json({ ok: true });
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
                    content: `You are a senior game QA analyst. Respond with valid JSON only at the top level, no markdown, no wrapper objects. Use exactly these keys and no others: game_summary, technical_feasibility, development_risks, qa_test_cases, automation_possible_tests, manual_tests_required, deployment_readiness_score. Shape: ${ANALYSIS_SCHEMA}. deployment_readiness_score must be an integer from 0 to 100. All array fields must be JSON arrays of strings.`,
                },
                {
                    role: "user",
                    content: `Analyze this Game Design Document and populate every required top-level field with concrete content from the GDD.

Required keys:
- game_summary (string)
- technical_feasibility (string)
- development_risks (string array)
- qa_test_cases (string array)
- automation_possible_tests (string array)
- manual_tests_required (string array)
- deployment_readiness_score (integer 0-100)

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
