use std::fs;
use std::path::Path;

fn main() {
    if let Err(e) = convert_migrations() {
        eprintln!("Error converting migrations: {}", e);
        std::process::exit(1);
    }

    tauri_build::build()
}

fn convert_migrations() -> Result<(), Box<dyn std::error::Error>> {
    let drizzle_dir = Path::new("../../../drizzle/sqlite");
    let migrations_dir = Path::new("src/migrations");

    if !migrations_dir.exists() {
        fs::create_dir_all(migrations_dir)?;
    }

    let entries = fs::read_dir(drizzle_dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("sql") {
            let filename = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

            // Parse drizzle format: 0000_some_silly_title.sql
            if let Some((version_str, name)) = filename.split_once('_') {
                let version: u32 = version_str.parse()?;
                let refinery_version = version + 1;

                // Output to refinery format: V1__some_silly_title.sql
                let refinery_filename = format!("V{}__{}.sql", refinery_version, name);
                let output_path = migrations_dir.join(&refinery_filename);

                let content = fs::read_to_string(&path)?;

                // Remove backticks from table/column names and statement-breakpoint
                // Add IF NOT EXISTS to CREATE statements to handle existing tables/indexes
                let converted = content
                    .replace('`', "")
                    .replace("--> statement-breakpoint", "")
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .map(|line| {
                        let upper = line.to_uppercase();
                        // Add IF NOT EXISTS to CREATE TABLE statements
                        if upper.starts_with("CREATE TABLE ") {
                            line.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
                                .replace("create table ", "CREATE TABLE IF NOT EXISTS ")
                        // Add IF NOT EXISTS to CREATE INDEX statements
                        } else if upper.starts_with("CREATE INDEX ") {
                            line.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ")
                                .replace("create index ", "CREATE INDEX IF NOT EXISTS ")
                        } else if upper.starts_with("CREATE UNIQUE INDEX ") {
                            line.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ")
                                .replace("create unique index ", "CREATE UNIQUE INDEX IF NOT EXISTS ")
                        } else {
                            line.to_string()
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                fs::write(&output_path, converted)?;

                println!("Converted: {} -> {}", filename, refinery_filename);
            }

            // Tell cargo to rerun if this drizzle file changes
            println!("cargo:rerun-if-changed={}", path.canonicalize()?.display());
        }
    }

    // Watch drizzle directory as well
    println!("cargo:rerun-if-changed={}", drizzle_dir.canonicalize()?.display());

    Ok(())
}
