use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use crate::app::error::AppError;
use crate::app::utility::generate_uuid;

const DEFAULT_MODEL_ID: &str = "gpt-5.4";

pub fn run_codex_prompt(prompt: &str, model_id: Option<&str>) -> Result<String, AppError> {
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
        Some("") | None => Some(DEFAULT_MODEL_ID),
        Some("default") => Some(DEFAULT_MODEL_ID),
        Some(model_id) => Some(model_id),
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
