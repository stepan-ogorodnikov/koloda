use tauri::command;

use crate::{
    app::db::DB,
    app::error::AppError,
    domain::lessons::{GetLessonDataParams, GetLessonsParams, Lesson, LessonData, LessonResultData},
    repo::lessons as repo,
};

#[command]
pub fn cmd_get_lessons(db: DB<'_>, params: GetLessonsParams) -> Result<Vec<Lesson>, AppError> {
    repo::get_lessons(&db, params)
}

#[command]
pub fn cmd_get_lesson_data(db: DB<'_>, params: GetLessonDataParams) -> Result<Option<LessonData>, AppError> {
    repo::get_lesson_data(&db, &params)
}

#[command]
pub fn cmd_submit_lesson_result(db: DB<'_>, data: LessonResultData) -> Result<(), AppError> {
    repo::submit_lesson_result(&db, data)
}
