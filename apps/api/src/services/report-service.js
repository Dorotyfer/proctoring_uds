const MAX_REPORT_ROWS = 10000;
const COLUMNS = [
  ['id', 'id'],
  ['courseId', 'course_id'],
  ['studentName', 'student_name'],
  ['status', 'status'],
  ['deviceMode', 'device_mode'],
  ['controlLevel', 'control_level'],
  ['riskCategory', 'risk_category'],
  ['riskScore', 'risk_score'],
  ['alertCount', 'alert_count'],
  ['openAlertCount', 'open_alert_count'],
  ['createdAt', 'created_at']
];

export function createCsvReport(rows) {
  if (rows.length > MAX_REPORT_ROWS) {
    throw new RangeError(`Reports cannot contain more than ${MAX_REPORT_ROWS} rows`);
  }
  return [
    COLUMNS.map(([, header]) => header).join(','),
    ...rows.map((row) => COLUMNS.map(([key]) => csvCell(key === 'studentName' ? row[key] : row[key])).join(','))
  ].join('\r\n') + '\r\n';
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
