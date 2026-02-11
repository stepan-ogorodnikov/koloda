use crate::app::db::MIGRATIONS_TABLE;
use refinery::Runner;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("./");
}

pub fn runner() -> Runner {
    let mut runner = embedded::migrations::runner();
    runner.set_migration_table_name(MIGRATIONS_TABLE);
    runner
}
