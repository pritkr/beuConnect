/**
 * The GECS register reader — `src/features/tools/gecs.ts`, no network.
 *
 * Runs headless. Every reply below is the shape the Supabase RPCs return:
 * `validate_guardian_mobile` answers a bare boolean, and
 * `get_complete_student_data` answers `{ student, attendance_entries,
 * attendance_records, papers }`. The payload is written from the columns the
 * register itself stores (attendance_entries.csv / attendance_records.csv),
 * because the RPC's success shape is assembled from those tables.
 *
 * The tests pin the three things a screen depends on: counts that survive
 * snake_case and numeric strings, a typed error that keeps the HTTP status and
 * Supabase's message, and a null or malformed answer that never throws.
 */

import { describe, expect, test } from "nsh/test";
import { Storage } from "nsh";
import type { GecsError, GecsReply, GecsResult, GecsSnapshot } from "../../src/features/tools/gecs";
import {
  clearGecsCache,
  fetchStudent,
  guardianMobileError,
  httpError,
  normaliseStudentData,
  readGecsCache,
  registrationError,
  validate,
  writeGecsCache,
} from "../../src/features/tools/gecs";
import { KEYS } from "../../src/features/tools/state";

const REG = "24105157001";
const AT = 1_700_000_000_000;

/** The RPC's documented shape, with the field names the tables use. */
const PAYLOAD = {
  student: {
    id: 12,
    roll_no: "24CSE45",
    registration_no: REG,
    name: "ASHA KUMARI",
    batch: "2K24",
    branch: "CSE",
  },
  attendance_entries: [
    {
      id: 901,
      branch: "CSE",
      batch: "2K24",
      paper_code: "100608",
      from_date: "2026-07-06",
      to_date: "2026-08-14",
      total_classes: 12,
      faculty_user_id: 1042,
      created_at: "2026-08-14T10:00:00Z",
    },
    {
      id: 902,
      branch: "CSE",
      batch: "2K24",
      paper_code: "100608",
      from_date: "2026-08-18",
      to_date: "2026-09-04",
      total_classes: 8,
      faculty_user_id: 1042,
      created_at: "2026-09-04T10:00:00Z",
    },
    {
      id: 903,
      branch: "CSE",
      batch: "2K24",
      paper_code: "100609P",
      from_date: "2026-07-10",
      to_date: "2026-09-10",
      total_classes: 6,
      faculty_user_id: 1043,
      created_at: "2026-09-10T10:00:00Z",
    },
    {
      id: 904,
      branch: "CSE",
      batch: "2K24",
      paper_code: "100610",
      from_date: "2026-07-08",
      to_date: "2026-09-12",
      total_classes: 10,
      faculty_user_id: 1044,
      created_at: "2026-09-12T10:00:00Z",
    },
  ],
  attendance_records: [
    { id: 5001, attendance_entry_id: 901, roll_no: "24CSE45", registration_no: REG, present_classes: 10 },
    { id: 5002, attendance_entry_id: 902, roll_no: "24CSE45", registration_no: REG, present_classes: 6 },
    { id: 5003, attendance_entry_id: 903, roll_no: "24CSE45", registration_no: REG, present_classes: 0 },
    // 100610 has no record for this student; the paper's own present count is the fallback.
  ],
  papers: [
    { paper_code: "100608", paper_name: "Data Structures" },
    { paper_code: "100609P", paper_name: "Data Structures Lab" },
    { paper_code: "100610", paper_name: "Mathematics III", total_classes: 10, present_classes: 7 },
  ],
};

function ok<T>(result: GecsResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.kind}: ${result.message}`);
  return result.value;
}

function failed<T>(result: GecsResult<T>): GecsError {
  if (result.ok) throw new Error("expected a failure");
  return result;
}

function sender(reply: GecsReply) {
  return async (): Promise<GecsReply> => reply;
}

describe("normalising the register", () => {
  test("two entries for one paper add up, and an entry with no record falls back to the paper total", () => {
    const snapshot: GecsSnapshot = ok(normaliseStudentData(PAYLOAD, REG, AT));

    expect(snapshot.regNo).toBe(REG);
    expect(snapshot.fetchedAt).toBe(AT);
    expect(snapshot.studentName).toBe("ASHA KUMARI");
    expect(snapshot.papers).toEqual([
      { code: "100608", name: "Data Structures", attended: 16, total: 20 },
      { code: "100609P", name: "Data Structures Lab", attended: 0, total: 6 },
      { code: "100610", name: "Mathematics III", attended: 7, total: 10 },
    ]);
  });

  test("numeric strings, a row returned as an array, and a record with no entry", () => {
    const snapshot = ok(
      normaliseStudentData(
        {
          student: [{ name: "RAVI KUMAR" }],
          attendance_entries: [
            { id: "7", paper_code: 100608, total_classes: "5" },
            null,
            "not a row",
          ],
          attendance_records: [
            { entry_id: "7", present_classes: "3" },
            { attendance_entry_id: 999, paper_code: "100609", present_classes: 2 },
            { attendance_entry_id: 999, present_classes: 4 },
          ],
        },
        REG,
        AT,
      ),
    );

    expect(snapshot.studentName).toBe("RAVI KUMAR");
    expect(snapshot.papers).toEqual([
      { code: "100608", name: "100608", attended: 3, total: 5 },
      // No entry carries this paper, so the attended count is the only proof a
      // class happened; it becomes the total rather than printing 2 of 0.
      { code: "100609", name: "100609", attended: 2, total: 2 },
    ]);
  });

  test("a record that cannot be tied to a paper is skipped, not guessed", () => {
    const snapshot = ok(
      normaliseStudentData(
        {
          attendance_entries: [{ id: 1, paper_code: "100608", total_classes: 4 }],
          attendance_records: [{ attendance_entry_id: 1, present_classes: 3 }, { present_classes: 9 }],
        },
        REG,
        AT,
      ),
    );
    expect(snapshot.papers).toEqual([{ code: "100608", name: "100608", attended: 3, total: 4 }]);
  });

  test("missing arrays and unexpected types produce an empty list, never a throw", () => {
    const snapshot = ok(
      normaliseStudentData(
        { student: { name: "ASHA" }, attendance_entries: "missing", attendance_records: 42, papers: {} },
        REG,
        AT,
      ),
    );
    expect(snapshot.papers).toEqual([]);
  });
});

describe("a reply that is not a student", () => {
  test("null means no student with that number", () => {
    const error = failed(normaliseStudentData(null, REG, AT));
    expect(error.kind).toBe("empty");
    expect(error.status).toBe(200);
    expect(error.message).toBe("No student with that registration number.");
  });

  test("a string or an array is a shape error", () => {
    expect(failed(normaliseStudentData("ok", REG, AT)).kind).toBe("shape");
    expect(failed(normaliseStudentData([{ name: "ASHA" }], REG, AT)).kind).toBe("shape");
    expect(failed(normaliseStudentData({}, REG, AT)).kind).toBe("shape");
  });

  test("an object with only a message keeps Supabase's sentence", () => {
    const error = failed(normaliseStudentData({ message: "Student not found" }, REG, AT));
    expect(error.kind).toBe("shape");
    expect(error.message).toBe("Student not found");
  });
});

describe("http failures", () => {
  test("401 keeps the status and the server message", () => {
    const error = httpError(401, { code: "401", message: "JWT expired", hint: null, details: null });
    expect(error).toEqual({ ok: false, kind: "http", status: 401, message: "JWT expired" });
  });

  test("404 without a useful body falls back to the status wording", () => {
    const error = httpError(404, "<html><body>Not Found</body></html>");
    expect(error.status).toBe(404);
    expect(error.message).toBe("That information isn't available.");
  });

  test("a phone number echoed back by the server is never shown", () => {
    const error = httpError(400, { message: "guardian 9876543210 rejected" });
    expect(error.message).toBe("guardian … rejected");
  });

  test("a transport failure is offline, with the transport sentence", () => {
    const error = httpError(0, null, "The request timed out. Check your connection and try again.");
    expect(error.kind).toBe("offline");
    expect(error.status).toBe(0);
    expect(error.message).toBe("The request timed out. Check your connection and try again.");
  });
});

describe("the two rpc calls", () => {
  test("a 401 from either call is a typed error, not a thrown one", async () => {
    const reply = { status: 401, body: { message: "Invalid API key" } };

    const checked = failed(await validate(REG, "9876543210", { send: sender(reply) }));
    expect(checked.status).toBe(401);
    expect(checked.message).toBe("Invalid API key");

    const fetched = failed(await fetchStudent(REG, { send: sender(reply), now: AT }));
    expect(fetched.status).toBe(401);
    expect(fetched.message).toBe("Invalid API key");
  });

  test("a 404 from the student call keeps the status", async () => {
    const error = failed(
      await fetchStudent(REG, { send: sender({ status: 404, body: { message: "Not found" } }), now: AT }),
    );
    expect(error.status).toBe(404);
    expect(error.message).toBe("Not found");
  });

  test("the guardian check returns false as an answer, not an error", async () => {
    expect(ok(await validate(REG, "9876543210", { send: sender({ status: 200, body: true }) }))).toBe(true);
    expect(ok(await validate(REG, "9876543210", { send: sender({ status: 200, body: false }) }))).toBe(false);
    expect(ok(await validate(REG, "9876543210", { send: sender({ status: 200, body: { valid: false } }) }))).toBe(
      false,
    );
  });

  test("a null student payload comes back empty, not as zero papers", async () => {
    const error = failed(await fetchStudent(REG, { send: sender({ status: 200, body: null }), now: AT }));
    expect(error.kind).toBe("empty");
  });
});

describe("the offline copy", () => {
  const SNAPSHOT: GecsSnapshot = {
    regNo: REG,
    fetchedAt: 1_234_567,
    studentName: "ASHA KUMARI",
    papers: [
      { code: "100608", name: "Data Structures", attended: 16, total: 20 },
      { code: "100609P", name: "Data Structures Lab", attended: 0, total: 6 },
    ],
  };

  test("a snapshot survives a write and a read, and stores no phone number", async () => {
    await clearGecsCache();
    await writeGecsCache(SNAPSHOT);

    expect(await readGecsCache()).toEqual(SNAPSHOT);

    const raw = (await Storage.getItem("beu." + KEYS.gecs)) ?? "";
    expect(raw).not.toBe("");
    expect(raw).toContain(REG);
    // A mobile is ten digits and never part of the 11-digit registration number.
    expect(raw).not.toMatch(/(^|\D)\d{10}(\D|$)/);

    await clearGecsCache();
    expect(await readGecsCache()).toBe(null);
  });

  test("a corrupt payload reads as no cache, never as a crash", async () => {
    await Storage.setItem("beu." + KEYS.gecs, "{not json");
    expect(await readGecsCache()).toBe(null);
    await clearGecsCache();
  });

  test("a stored payload missing its registration number is ignored", async () => {
    await Storage.setItem("beu." + KEYS.gecs, JSON.stringify({ fetchedAt: 1_234_567, papers: [] }));
    expect(await readGecsCache()).toBe(null);
    await clearGecsCache();
  });
});

describe("local validation", () => {
  test("the registration number is exactly 11 digits", () => {
    expect(registrationError("24105157001")).toBe("");
    expect(registrationError(" 24105157001 ")).toBe("");
    expect(registrationError("2410515700")).not.toBe("");
    expect(registrationError("241051570012")).not.toBe("");
    expect(registrationError("2410515700a")).not.toBe("");
    expect(registrationError("")).not.toBe("");
  });

  test("the guardian mobile is exactly 10 digits", () => {
    expect(guardianMobileError("9876543210")).toBe("");
    expect(guardianMobileError(" 9876543210 ")).toBe("");
    expect(guardianMobileError("987654321")).not.toBe("");
    expect(guardianMobileError("98765432100")).not.toBe("");
    expect(guardianMobileError("+91 9876543210")).not.toBe("");
    expect(guardianMobileError("")).not.toBe("");
  });
});
