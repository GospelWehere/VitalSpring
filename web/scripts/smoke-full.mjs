import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const idFor = (name) => {
  const found = Object.entries(manifest).find(([, info]) => info.exportedName === name);
  if (!found) throw new Error(`no action id for ${name}`);
  return found[0];
};
const BASE = "http://localhost:3000";
const cookieJar = { value: "" };

async function post(path, actionName, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(`_1_${k}`, String(v));
  fd.set("0", '["$K1"]');
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Next-Action": idFor(actionName),
      "Accept": "text/x-component",
      "Origin": BASE,
      "Referer": BASE + path,
      ...(cookieJar.value ? { Cookie: cookieJar.value } : {}),
    },
    body: fd,
    redirect: "manual",
  });
  const text = await res.text();
  let actionResult = null;
  if (res.status === 303) {
    actionResult = { ok: true, redirect: res.headers.get("location") };
  } else {
    for (const line of text.split("\n")) {
      if (line.startsWith("1:")) {
        try {
          const obj = JSON.parse(line.slice(2));
          if (obj && typeof obj === "object" && "ok" in obj) actionResult = obj;
        } catch {}
      }
    }
  }
  return { status: res.status, result: actionResult, raw: text.slice(0, 300) };
}

async function login(username, password) {
  const fd = new FormData();
  fd.set("_1_username", username);
  fd.set("_1_password", password);
  fd.set("0", '[null,"$K1"]');
  const res = await fetch(BASE + "/login", {
    method: "POST",
    headers: { "Next-Action": idFor("loginAction"), "Accept": "text/x-component", "Origin": BASE, "Referer": BASE + "/login" },
    body: fd,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`login as ${username} failed: ${res.status}`);
  cookieJar.value = setCookie.split(";")[0];
  console.log(`[login] ${username} OK`);
}

const fail = (step, detail) => { throw new Error(`${step}: ${detail}`); };

async function main() {
  await login("reception", "Reception@123");

  const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
  let openSlot = null;
  let slotData = null;
  for (let pid = 1; pid <= 5; pid += 1) {
    slotData = await (await fetch(`${BASE}/api/slots?practitionerId=${pid}&date=${today}`)).json();
    openSlot = (slotData.slots ?? slotData).find((s) => s.slot_status === "open");
    if (openSlot) break;
  }
  if (!openSlot) fail("slots", `no open slot for ${today}`);
  console.log(`[slots] picked slot ${openSlot.slot_id} ${openSlot.slot_date} ${openSlot.start_time}`);

  let r = await post("/app/booking", "bookAppointmentAction", {
    patientId: 1, slotId: openSlot.slot_id, visitReason: "Fever and headache", bookingSource: "front_desk",
  });
  const appointmentId = r.result?.values?.appointmentId;
  console.log("[book]", r.status, JSON.stringify(r.result));
  if (r.status !== 200 || !r.result?.ok || !appointmentId) fail("book", r.raw);

  r = await post("/app/queue", "checkInAction", { appointmentId });
  console.log("[check-in]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("check-in", r.raw);
  const queueData = await (await fetch(`${BASE}/api/queue`, { headers: { Cookie: cookieJar.value } })).json();
  const entry = (queueData.entries ?? []).find((e) => String(e.appointment_id) === String(appointmentId));
  const queueEntryId = entry?.queue_entry_id ?? r.result?.values?.queueEntryId;
  if (!queueEntryId) fail("check-in", "no queue entry id in api/queue");

  cookieJar.value = "";
  await login("nurse", "Nurse@123");
  r = await post("/app/queue", "queueTransitionAction", { queueEntryId, status: "vitals" });
  console.log(`[queue->vitals]`, r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail(`queue->vitals`, r.raw);

  cookieJar.value = "";
  await login("doctor", "Doctor@123");
  for (const to of ["called", "with_practitioner"]) {
    r = await post("/app/queue", "queueTransitionAction", { queueEntryId, status: to });
    console.log(`[queue->${to}]`, r.status, JSON.stringify(r.result));
    if (!r.result?.ok) fail(`queue->${to}`, r.raw);
  }

  cookieJar.value = "";
  await login("nurse", "Nurse@123");
  r = await post("/app/queue", "queueTransitionAction", { queueEntryId, status: "completed" });
  console.log(`[queue->completed]`, r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail(`queue->completed`, r.raw);

  cookieJar.value = "";
  await login("doctor", "Doctor@123");
  r = await post("/app/booking", "saveVisitAction", {
    appointmentId, presentingComplaint: "Fever and headache for 3 days", clinicalFindings: "Temp 38.5C", diagnosis: "Malaria", carePlan: "ACT + paracetamol",
  });
  console.log("[visit]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("visit", r.raw);

  const visitPage = await fetch(`${BASE}/app/visits/${appointmentId}`, { headers: { Cookie: cookieJar.value } });
  const visitHtml = await visitPage.text();
  console.log("[visit page]", visitPage.status, visitHtml.includes("Malaria") ? "shows diagnosis" : "NO DIAGNOSIS");

  cookieJar.value = "";
  await login("admin", "Administrator@123");
  r = await post("/app/admin/accounts", "createAccountAction", {
    username: `e2e_${Date.now() % 100000}`, displayName: "E2E Tester", role: "nurse", password: "E2EPass123!",
  });
  console.log("[create account]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("create account", r.raw);

  r = await post("/app/admin/accounts", "createAccountAction", { username: "e2e_bad", displayName: "X", role: "boss", password: "x" });
  console.log("[create account bad]", r.status, JSON.stringify(r.result));
  if (r.result?.ok) fail("bad account should fail", r.raw);

  r = await post("/app/admin/accounts", "toggleAccountAction", { userId: "3", active: "false" });
  console.log("[toggle reception off]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("toggle off", r.raw);
  r = await post("/app/admin/accounts", "toggleAccountAction", { userId: "3", active: "true" });
  console.log("[toggle reception on]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("toggle on", r.raw);

  r = await post("/app/admin/accounts", "resetPasswordAction", { userId: "3", password: "Reception@123" });
  console.log("[reset password]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("reset password", r.raw);

  r = await post("/app/admin/backup", "backupExportAction", {});
  const tables = r.result?.backup?.tables ? Object.keys(r.result.backup.tables).length : 0;
  console.log("[backup export]", r.status, `ok=${r.result?.ok} tables=${tables}`);
  if (!r.result?.ok) fail("backup export", r.raw);

  cookieJar.value = "";
  const portalSlotData = await (await fetch(`${BASE}/api/slots?practitionerId=2&date=${today}`)).json();
  const portalSlot = (portalSlotData.slots ?? portalSlotData).find((s) => s.slot_status === "open");
  if (!portalSlot) fail("portal book", "no open slot");
  r = await post("/portal", "portalBookAppointmentAction", {
    patientId: 1, slotId: portalSlot.slot_id, visitReason: "Follow-up visit",
  });
  console.log("[portal book]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("portal book", r.raw);
  const portalAppointmentId = r.result?.values?.appointmentId;

  r = await post("/portal", "portalBookAppointmentAction", {
    patientId: 1, slotId: portalSlot.slot_id, visitReason: "Duplicate attempt",
  });
  console.log("[portal duplicate]", r.status, JSON.stringify(r.result));
  if (r.result?.ok) fail("duplicate should be rejected", r.raw);

  if (portalAppointmentId) {
    r = await post("/portal/manage", "portalCancelAppointmentAction", { hospitalNumber: "VS-000001", phone: "08033124567", appointmentId: portalAppointmentId });
    console.log("[portal cancel]", r.status, JSON.stringify(r.result));
    if (!r.result?.ok) fail("portal cancel", r.raw);
  }

  cookieJar.value = "";
  await login("doctor", "Doctor@123");
  r = await post("/app/schedule", "createSlotsAction", { practitionerId: 2, days: 3, startHour: 9, endHour: 12 });
  console.log("[create slots]", r.status, JSON.stringify(r.result));
  if (!r.result?.ok) fail("create slots", r.raw);

  console.log("\nALL FLOWS PASSED");
}
main().catch((e) => { console.error("\nSMOKE FAIL:", e.message); process.exit(1); });
