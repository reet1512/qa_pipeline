//! Common API types: configuration, health, context

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Health check response
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// Context file representation
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    pub name: String,
    pub path: String,
    pub content: String,
    pub token_count: usize,
    pub last_modified: DateTime<Utc>,
}

/// LeanSpec configuration structure
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LeanSpecConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub specs_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub structure: Option<ConfigStructure>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub features: Option<ConfigFeatures>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_status: Option<DraftStatusConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub templates: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DraftStatusConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigStructure {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence_digits: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigFeatures {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_agents: Option<bool>,
}

/// Project config container
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<ContextFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed: Option<LeanSpecConfig>,
}

/// Project context response
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../../../packages/ui/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ProjectContextResponse {
    pub agent_instructions: Vec<ContextFile>,
    pub config: ProjectConfigResponse,
    pub project_docs: Vec<ContextFile>,
    pub total_tokens: usize,
    pub project_root: String,
}
