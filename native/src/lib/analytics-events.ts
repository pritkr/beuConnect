/**
 * GENERATED — do not edit.
 *
 * The app's half of the GA4 vocabulary. `src/lib/analytics/events.json` is the
 * source; `bun scripts/sync-analytics-events.ts` writes this file, and
 * `src/lib/analytics/taxonomy.test.ts` fails when the two disagree.
 *
 * Repeating the object here is deliberate: the app bundles its own strings and
 * never reads a file from the web project at runtime or build time.
 */
export const EVENTS = {
	pageView: "page_view",
	screenView: "screen_view",
	appOpen: "app_open",
	featureOpen: "feature_open",
	searchOpen: "search_open",
	searchQuery: "search_query",
	searchResultOpen: "search_result_open",
	moreOpen: "more_open",
	profileSave: "profile_save",
	syllabusSelect: "syllabus_select",
	syllabusSearch: "syllabus_search",
	syllabusSubjectOpen: "syllabus_subject_open",
	syllabusTopicToggle: "syllabus_topic_toggle",
	syllabusDownload: "syllabus_download",
	syllabusSave: "syllabus_save",
	pyqSelect: "pyq_select",
	pyqSubjectOpen: "pyq_subject_open",
	pyqPaperOpen: "pyq_paper_open",
	pyqPdfOpen: "pyq_pdf_open",
	pyqPdfDownload: "pyq_pdf_download",
	resultLookup: "result_lookup",
	resultOutcome: "result_outcome",
	resultSave: "result_save",
	resultShare: "result_share",
	rankCheck: "rank_check",
	meritFilter: "merit_filter",
	tableFilter: "table_filter",
	battleStart: "battle_start",
	studentsSearch: "students_search",
	studentsCollegeOpen: "students_college_open",
	studentsBranchOpen: "students_branch_open",
	studentsStudentOpen: "students_student_open",
	calculatorUse: "calculator_use",
	calculatorSave: "calculator_save",
	calculatorPreset: "calculator_preset",
	attendanceMark: "attendance_mark",
	attendanceSubjectAdd: "attendance_subject_add",
	routineView: "routine_view",
	holidayMonthView: "holiday_month_view",
	wifiLogin: "wifi_login",
	plannerTaskAdd: "planner_task_add",
	plannerTaskComplete: "planner_task_complete",
	reminderCreate: "reminder_create",
	noticeOpen: "notice_open",
	noticesSearch: "notices_search",
	noteOpen: "note_open",
	noteBookmark: "note_bookmark",
	announcementOpen: "announcement_open",
	pdfView: "pdf_view",
	feedbackOpen: "feedback_open",
	feedbackSubmit: "feedback_submit",
	share: "share",
	outboundClick: "outbound_click",
	fileDownload: "file_download",
	pwaInstall: "pwa_install",
	updateOpen: "update_open",
	errorShown: "error_shown",
	dataRefresh: "data_refresh",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
