"""SQL-backed panel reporting queries with mandatory course scopes."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from proctoring_api.db.rows import parse_json, to_iso_datetime


class SqlPanelRepository:
  def __init__(self, engine: AsyncEngine) -> None:
    self._engine = engine

  async def list_courses(self, scope: dict[str, Any], query: dict[str, Any]) -> dict[str, Any]:
    where, parameters = _scope_where(scope, "WHERE")
    if where is None:
      return _paged("courses", [], 0, query)
    search_sql = ""
    if query["query"]:
      search_sql = f" {'AND' if where else 'WHERE'} (courses.name LIKE :search ESCAPE '\\\\' OR sessions.moodle_course_id LIKE :search ESCAPE '\\\\')"
      parameters["search"] = f"%{_escape_like(query['query'])}%"
    async with self._engine.connect() as connection:
      count = await connection.execute(text(f"""
        SELECT COUNT(DISTINCT sessions.moodle_course_id) AS total
        FROM proctoring_sessions sessions JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
        {where}{search_sql}
      """), parameters)
      rows = await connection.execute(text(f"""
        SELECT sessions.moodle_course_id, courses.name, COUNT(DISTINCT sessions.id) AS attempt_count,
          COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions JOIN proctoring_courses courses ON courses.moodle_course_id = sessions.moodle_course_id
        LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id {where}{search_sql}
        GROUP BY sessions.moodle_course_id, courses.name ORDER BY courses.name, sessions.moodle_course_id
        LIMIT :limit OFFSET :offset
      """), parameters | {"limit": query["pageSize"], "offset": _offset(query)})
      total = int(count.mappings().first()["total"])
      return _paged("courses", [{"code": row["moodle_course_id"], "id": row["moodle_course_id"], "name": row["name"],
        "attemptCount": int(row["attempt_count"]), "openAlertCount": int(row["open_alert_count"])} for row in rows.mappings().all()], total, query)

  async def list_course_sessions(self, course_id: str, scope: dict[str, Any], query: dict[str, Any]) -> dict[str, Any]:
    filters = _session_filters(course_id, scope, query)
    if filters is None:
      return _paged("sessions", [], 0, query)
    where, parameters, having = filters
    async with self._engine.connect() as connection:
      count = await connection.execute(text(f"SELECT COUNT(*) AS total FROM (SELECT sessions.id FROM proctoring_sessions sessions LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id {where} GROUP BY sessions.id {having}) filtered"), parameters)
      rows = await connection.execute(text(f"""
        SELECT sessions.id, sessions.moodle_course_id, sessions.moodle_quiz_id, sessions.moodle_attempt_id, sessions.quiz_name,
          sessions.student_name, sessions.student_document, sessions.device_mode, sessions.status, sessions.created_at, sessions.prepared_at,
          COALESCE(MAX(biometric_checks.result), IF(MAX(biometric_profiles.status = 'active'), 'enrolled', 'unregistered')) AS biometric_status,
          COUNT(alerts.id) AS alert_count, COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        LEFT JOIN proctoring_biometric_checks biometric_checks ON biometric_checks.session_id = sessions.id
        LEFT JOIN proctoring_biometric_profiles biometric_profiles ON biometric_profiles.moodle_user_id = sessions.moodle_user_id
        {where} GROUP BY sessions.id {having} ORDER BY sessions.created_at DESC LIMIT :limit OFFSET :offset
      """), parameters | {"limit": query["pageSize"], "offset": _offset(query)})
      return _paged("sessions", [_session_summary(row) for row in rows.mappings().all()], int(count.mappings().first()["total"]), query)

  async def list_sessions(self, scope: dict[str, Any]) -> list[dict[str, Any]]:
    where, parameters = _scope_where(scope, "WHERE")
    if where is None:
      return []
    async with self._engine.connect() as connection:
      rows = await connection.execute(text(f"""
        SELECT sessions.id, sessions.moodle_course_id, sessions.moodle_quiz_id, sessions.moodle_attempt_id, sessions.device_mode, sessions.status, sessions.created_at, sessions.prepared_at,
          COALESCE(MAX(biometric_checks.result), IF(MAX(biometric_profiles.status = 'active'), 'enrolled', 'unregistered')) AS biometric_status,
          COUNT(alerts.id) AS alert_count, COALESCE(SUM(alerts.status = 'open'), 0) AS open_alert_count
        FROM proctoring_sessions sessions LEFT JOIN proctoring_alerts alerts ON alerts.session_id = sessions.id
        LEFT JOIN proctoring_biometric_checks biometric_checks ON biometric_checks.session_id = sessions.id
        LEFT JOIN proctoring_biometric_profiles biometric_profiles ON biometric_profiles.moodle_user_id = sessions.moodle_user_id
        {where} GROUP BY sessions.id ORDER BY sessions.created_at DESC LIMIT 200
      """), parameters)
      return [_session_summary(row) for row in rows.mappings().all()]

  async def get_session(self, session_id: str, scope: dict[str, Any]) -> dict[str, Any] | None:
    filter_sql, parameters = _scope_where(scope, "AND")
    if filter_sql is None:
      return None
    async with self._engine.connect() as connection:
      result = await connection.execute(text(f"""
        SELECT sessions.*, biometric_checks.result AS biometric_result, biometric_checks.similarity AS biometric_similarity,
          biometric_checks.enrollment_version AS biometric_enrollment_version, biometric_profiles.status AS biometric_profile_status
        FROM proctoring_sessions sessions LEFT JOIN proctoring_biometric_checks biometric_checks ON biometric_checks.session_id = sessions.id
        LEFT JOIN proctoring_biometric_profiles biometric_profiles ON biometric_profiles.moodle_user_id = sessions.moodle_user_id
        WHERE sessions.id = :session_id {filter_sql}
      """), parameters | {"session_id": session_id})
      row = result.mappings().first()
      if not row:
        return None
      events = await connection.execute(text("SELECT id, type, occurred_at, metadata FROM proctoring_events WHERE session_id = :session_id ORDER BY occurred_at"), {"session_id": session_id})
      alerts = await connection.execute(text("""SELECT alerts.id, alerts.event_id, alerts.type, alerts.severity, alerts.status, alerts.created_at, alerts.reviewed_at, alerts.reviewed_by, alerts.review_note, evidence.id AS evidence_id, events.metadata AS event_metadata FROM proctoring_alerts alerts JOIN proctoring_events events ON events.id = alerts.event_id LEFT JOIN proctoring_evidence evidence ON evidence.event_id = alerts.event_id AND evidence.deleted_at IS NULL WHERE alerts.session_id = :session_id ORDER BY alerts.created_at"""), {"session_id": session_id})
      evidence = await connection.execute(text("SELECT id, event_id, kind, content_type, created_at, expires_at FROM proctoring_evidence WHERE session_id = :session_id AND deleted_at IS NULL ORDER BY created_at"), {"session_id": session_id})
      return _session_detail(row, events.mappings().all(), alerts.mappings().all(), evidence.mappings().all())

  async def review_alert(self, alert_id: str, reviewer_id: str, review_status: str, note: str, scope: dict[str, Any]) -> dict[str, Any] | None:
    filter_sql, parameters = _scope_where(scope, "AND")
    if filter_sql is None:
      return None
    async with self._engine.begin() as connection:
      authorized = await connection.execute(text(f"SELECT alerts.id FROM proctoring_alerts alerts JOIN proctoring_sessions sessions ON sessions.id = alerts.session_id WHERE alerts.id = :alert_id {filter_sql} FOR UPDATE"), parameters | {"alert_id": alert_id})
      if not authorized.mappings().first():
        return None
      await connection.execute(text("UPDATE proctoring_alerts SET status = :review_status, reviewed_at = UTC_TIMESTAMP(3), reviewed_by = :reviewer_id, review_note = :note WHERE id = :alert_id"), {"alert_id": alert_id, "review_status": review_status, "reviewer_id": reviewer_id, "note": note})
      row = await connection.execute(text("SELECT id, status, reviewed_at, reviewed_by, review_note FROM proctoring_alerts WHERE id = :alert_id"), {"alert_id": alert_id})
      value = dict(row.mappings().first())
      value["reviewed_at"] = to_iso_datetime(value["reviewed_at"])
      return value


def _scope_where(scope: dict[str, Any], prefix: str) -> tuple[str | None, dict[str, str]]:
  if scope.get("institutional"):
    return "", {}
  ids = scope.get("courseIds") or []
  if not ids:
    return None, {}
  parameters = {f"course_id_{index}": str(value) for index, value in enumerate(ids)}
  placeholders = ", ".join(f":course_id_{index}" for index in range(len(parameters)))
  return f"{prefix} sessions.moodle_course_id IN ({placeholders})", parameters


def _session_filters(course_id: str, scope: dict[str, Any], query: dict[str, Any]):
  scoped, parameters = _scope_where(scope, "AND")
  if scoped is None:
    return None
  clauses = ["sessions.moodle_course_id = :course_id"]
  parameters["course_id"] = course_id
  if scoped:
    clauses.append(scoped.removeprefix("AND "))
  if query["query"]:
    parameters["search"] = f"%{_escape_like(query['query'])}%"
    clauses.append("(sessions.student_name LIKE :search ESCAPE '\\\\' OR sessions.student_document LIKE :search ESCAPE '\\\\' OR sessions.quiz_name LIKE :search ESCAPE '\\\\' OR sessions.moodle_attempt_id LIKE :search ESCAPE '\\\\')")
  if query["status"] != "all":
    parameters["status"] = query["status"]
    clauses.append("sessions.status = :status")
  if query.get("dateFrom"):
    parameters["date_from"] = f"{query['dateFrom']} 00:00:00.000"
    clauses.append("sessions.created_at >= :date_from")
  if query.get("dateTo"):
    parameters["date_to"] = f"{query['dateTo']} 00:00:00.000"
    clauses.append("sessions.created_at < DATE_ADD(:date_to, INTERVAL 1 DAY)")
  having = {"open": "HAVING SUM(alerts.status = 'open') > 0", "any": "HAVING COUNT(alerts.id) > 0", "none": "HAVING COUNT(alerts.id) = 0"}.get(query["alerts"], "")
  return f"WHERE {' AND '.join(clauses)}", parameters, having


def _session_summary(row: Any) -> dict[str, Any]:
  return {"id": str(row["id"]), "courseId": row["moodle_course_id"], "quizId": row["moodle_quiz_id"], "quizName": row.get("quiz_name"), "attemptId": row["moodle_attempt_id"], "studentName": row.get("student_name"), "studentDocumentLast4": mask_student_document(row.get("student_document")), "deviceMode": row["device_mode"], "status": row["status"], "biometricStatus": row.get("biometric_status") or "unregistered", "createdAt": to_iso_datetime(row["created_at"]), "preparedAt": to_iso_datetime(row["prepared_at"]) if row.get("prepared_at") else None, "alertCount": int(row["alert_count"]), "openAlertCount": int(row["open_alert_count"])}


def _session_detail(row: Any, events: list[Any], alerts: list[Any], evidence: list[Any]) -> dict[str, Any]:
  return {"id": str(row["id"]), "moodleUserId": row["moodle_user_id"], "courseId": row["moodle_course_id"], "quizId": row["moodle_quiz_id"], "quizName": row.get("quiz_name"), "attemptId": row["moodle_attempt_id"], "studentName": row.get("student_name"), "studentDocument": row.get("student_document"), "deviceMode": row["device_mode"], "status": row["status"], "biometric": {"enrollmentVersion": int(row["biometric_enrollment_version"]) if row.get("biometric_enrollment_version") is not None else None, "profileState": row.get("biometric_profile_status") or "unregistered", "similarity": float(row["biometric_similarity"]) if row.get("biometric_similarity") is not None else None, "status": row.get("biometric_result") or ("enrolled" if row.get("biometric_profile_status") == "active" else "unregistered")}, "createdAt": to_iso_datetime(row["created_at"]), "events": [{**dict(item), "occurred_at": to_iso_datetime(item["occurred_at"]), "metadata": parse_json(item["metadata"])} for item in events], "alerts": [_alert(item) for item in alerts], "evidence": [{**dict(item), "created_at": to_iso_datetime(item["created_at"]), "expires_at": to_iso_datetime(item["expires_at"])} for item in evidence]}


def _alert(row: Any) -> dict[str, Any]:
  result = {key: value for key, value in dict(row).items() if key not in {"event_metadata", "evidence_id"}}
  result["captureStatus"] = "available" if row.get("evidence_id") else ("unavailable" if (parse_json(row.get("event_metadata")) or {}).get("captureStatus") == "unavailable" else "pending")
  result["evidenceId"] = row.get("evidence_id")
  result["created_at"] = to_iso_datetime(row["created_at"])
  result["reviewed_at"] = to_iso_datetime(row["reviewed_at"]) if row.get("reviewed_at") else None
  return result


def mask_student_document(value: object) -> str | None:
  if value is None:
    return None
  document = str(value)
  return document if len(document) <= 4 else f"{'•' * (len(document) - 4)}{document[-4:]}"


def _escape_like(value: str) -> str:
  return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _offset(query: dict[str, Any]) -> int:
  return (query["page"] - 1) * query["pageSize"]


def _paged(key: str, values: list[dict[str, Any]], total: int, query: dict[str, Any]) -> dict[str, Any]:
  return {key: values, "page": query["page"], "pageSize": query["pageSize"], "total": total, "totalPages": 0 if total == 0 else (total + query["pageSize"] - 1) // query["pageSize"]}
