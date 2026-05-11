use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use serde::{Deserialize, Serialize};

use crate::app::error::AppError;
use crate::app::utility::generate_uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningLevel {
    pub effort: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexModel {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub context_length: u64,
    pub supported_reasoning_levels: Vec<ReasoningLevel>,
    pub default_reasoning_level: String,
}

#[derive(Debug, Deserialize)]
struct ModelsCacheEntry {
    slug: String,
    display_name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    visibility: String,
    context_window: u64,
    #[serde(default)]
    default_reasoning_level: Option<String>,
    #[serde(default)]
    supported_reasoning_levels: Vec<ReasoningLevel>,
}

#[derive(Debug, Deserialize)]
struct ModelsCache {
    models: Vec<ModelsCacheEntry>,
}

const CODEX_MODELS_CACHE_FILE: &str = "models_cache.json";

pub fn list_codex_models() -> Result<Vec<CodexModel>, AppError> {
    let cache_path = resolve_models_cache_path();
    let content = fs::read_to_string(&cache_path).map_err(|_| {
        AppError::new(
            "unknown",
            Some(format!(
                "Codex CLI models cache not found at {}. Run Codex CLI at least once to populate the model list.",
                cache_path.display()
            )),
        )
    })?;

    let cache: ModelsCache = serde_json::from_str(&content)?;
    let models: Vec<CodexModel> = cache.models
        .into_iter()
        .filter(|m| m.visibility == "list")
        .map(|m| {
            let levels = if m.supported_reasoning_levels.is_empty() {
                vec![
                    ReasoningLevel { effort: "low".to_string(), description: "Fast responses with lighter reasoning".to_string() },
                    ReasoningLevel { effort: "medium".to_string(), description: "Balances speed and reasoning depth for everyday tasks".to_string() },
                    ReasoningLevel { effort: "high".to_string(), description: "Greater reasoning depth for complex problems".to_string() },
                    ReasoningLevel { effort: "xhigh".to_string(), description: "Extra high reasoning depth for complex problems".to_string() },
                ]
            } else {
                m.supported_reasoning_levels
            };

            CodexModel {
                id: m.slug,
                name: m.display_name,
                description: m.description,
                context_length: m.context_window,
                default_reasoning_level: m.default_reasoning_level.unwrap_or_else(|| "medium".to_string()),
                supported_reasoning_levels: levels,
            }
        })
        .collect();

    if models.is_empty() {
        return Err(AppError::new(
            "unknown",
            Some("Codex CLI models cache contains no visible models.".to_string()),
        ));
    }

    Ok(models)
}

fn resolve_models_cache_path() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join(".codex").join(CODEX_MODELS_CACHE_FILE))
        .unwrap_or_else(|| PathBuf::from(CODEX_MODELS_CACHE_FILE))
}

pub fn run_codex_prompt(prompt: &str, model_id: Option<&str>, reasoning_effort: Option<&str>) -> Result<String, AppError> {
    let temp_dir = create_temp_dir()?;
    let output_path = temp_dir.join("output.txt");

    let executable = resolve_codex_executable();
    let mut command = Command::new(executable);
    command
        .arg("exec")
        .arg("--color")
        .arg("never")
        .arg("--skip-git-repo-check")
        .arg("--cd")
        .arg(&temp_dir)
        .arg("--ephemeral")
        .arg("--sandbox")
        .arg("read-only")
        .arg("-o")
        .arg(&output_path);

    if let Some(model_id) = normalize_model_id(model_id) {
        command.arg("--model").arg(model_id);
    }

    if let Some(effort) = normalize_reasoning_effort(reasoning_effort) {
        command.arg("-c").arg(format!("model_reasoning_effort={}", effort));
    }

    command
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(map_spawn_error)?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(prompt.as_bytes())?;
    }

    let output = child.wait_with_output()?;
    let response = fs::read_to_string(&output_path).unwrap_or_default();
    cleanup_temp_dir(&temp_dir);

    if output.status.success() && !response.trim().is_empty() {
        return Ok(response);
    }

    let details = extract_codex_error_details(&output)
        .unwrap_or_else(|| "Codex returned no output.".to_string());
    Err(AppError::new("unknown", Some(details)))
}

fn create_temp_dir() -> Result<PathBuf, AppError> {
    let dir = std::env::temp_dir().join(format!("koloda-codex-{}", generate_uuid()));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn cleanup_temp_dir(path: &Path) {
    let _ = fs::remove_dir_all(path);
}

fn normalize_model_id(model_id: Option<&str>) -> Option<&str> {
    match model_id.map(str::trim) {
        Some("") | Some("default") | None => None,
        Some(model_id) => Some(model_id),
    }
}

fn normalize_reasoning_effort(effort: Option<&str>) -> Option<&str> {
    match effort.map(str::trim) {
        Some("") | None => None,
        Some(effort) => Some(effort),
    }
}

fn map_spawn_error(error: std::io::Error) -> AppError {
    if error.kind() == std::io::ErrorKind::NotFound {
        return AppError::new(
            "unknown",
            Some("Codex CLI not found. Install Codex CLI and make sure it is available on PATH.".to_string()),
        );
    }

    AppError::from(error)
}

fn resolve_codex_executable() -> OsString {
    if let Some(home_dir) = dirs::home_dir() {
        let candidate = if cfg!(target_os = "windows") {
            home_dir.join(".bun").join("bin").join("codex.exe")
        } else {
            home_dir.join(".bun").join("bin").join("codex")
        };

        if candidate.exists() {
            return candidate.into_os_string();
        }
    }

    if cfg!(target_os = "windows") {
        OsString::from("codex.exe")
    } else {
        OsString::from("codex")
    }
}

fn extract_codex_error_details(output: &Output) -> Option<String> {
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stderr.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("warning:")
            || trimmed.starts_with("WARNING:")
            || trimmed.starts_with("mcp:")
            || trimmed.starts_with("mcp startup:")
        {
            continue;
        }

        if let Some(details) = trimmed.strip_prefix("ERROR: ") {
            return Some(details.to_string());
        }

        if let Some(details) = trimmed.strip_prefix("error: ") {
            return Some(details.to_string());
        }

        if trimmed.contains("stream disconnected")
            || trimmed.contains("failed to connect")
            || trimmed.contains("error sending request")
        {
            return Some(trimmed.to_string());
        }
    }

    if !output.status.success() {
        return Some(format!("Codex exited with status {}.", output.status));
    }

    None
}
