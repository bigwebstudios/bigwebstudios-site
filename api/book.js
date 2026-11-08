// POST /api/book
// Emails a booking confirmation with a calendar invite to the customer,
// and the same booking + invite to Big Web Studios so the slot is blocked on both calendars.
const { OWNER, PHONE, ADDRESS, MAPS, esc, isEmail, clean, send, layout, rows, readBody } = require("./_mail");

// Keep in sync with SPACES / ADDONS in index.html.
const SPACES = {
  podcast: { name: "Podcast studio", rate: 2000, max: 6 },
  content: { name: "Content shoot", rate: 1000, max: 4 },
};
const ADDONS = {
  eng: { name: "Sound engineer", rate: 800 },
  cam: { name: "Camera operator", rate: 1000 },
  edit: { name: "Editing", rate: 0 },
};
const OPEN = 10, CLOSE = 22, DEAL_HRS = 4, DEAL_PCT = 10;

// DRAFT studio rules: Akio to confirm.
const RULES = [
  "Please arrive on time. Your booked hours include set-up and pack-down.",
  "Running over is charged in 30-minute blocks at the hourly rate, only if the next slot is free.",
  "Maximum people: 6 in the podcast studio, 4 for content shoots, including your crew.",
  "No food or drinks near the mics, lights or equipment. Capped water bottles are fine.",
  "No smoking, alcohol or illegal substances anywhere on the premises.",
  "The studio is in a residential building. Use the studio entrance and keep noise low in shared areas and parking.",
  "Handle the gear with care. Damage from misuse is charged at repair or replacement cost.",
  "Payment is at the studio or by UPI at the start of your session.",
  "Free cancellation or rescheduling up to 24 hours before. Later cancellations and no-shows are charged 50% of the studio fee.",
  "Your content is yours. We only post behind-the-scenes clips with your permission.",
];

const inr = (n) => "₹" + n.toLocaleString("en-IN");
const pad = (n) => String(n).padStart(2, "0");
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// IST wall-clock time -> UTC Date
const istToUtc = (y, m, d, h) => new Date(Date.UTC(y, m - 1, d, h, 0) - 330 * 60000);
const icsTime = (dt) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function fold(line) {
  const out = []; let s = line;
  while (Buffer.byteLength(s) > 74) { let i = 74; while (Buffer.byteLength(s.slice(0, i)) > 74) i--; out.push(s.slice(0, i)); s = " " + s.slice(i); }
  out.push(s); return out.join("\r\n");
}

function ranges(hours) {
  const out = []; let s = null, p = null;
  hours.forEach((h) => { if (s === null) { s = p = h; } else if (h === p + 1) { p = h; } else { out.push([s, p + 1]); s = p = h; } });
  if (s !== null) out.push([s, p + 1]);
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });
  const b = readBody(req);
  if (b.website) return res.status(200).json({ ok: true });

  const sp = SPACES[b.space];
  const name = clean(b.name, 120), email = clean(b.email, 200), phone = clean(b.phone, 30), note = clean(b.note, 1000);
  const people = Math.max(1, Math.min(sp ? sp.max : 1, parseInt(b.people, 10) || 1));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.date || ""));
  const hours = [...new Set((Array.isArray(b.hours) ? b.hours : []).map(Number))].filter((h) => Number.isInteger(h) && h >= OPEN && h < CLOSE).sort((a, c) => a - c);
  const addons = (Array.isArray(b.addons) ? b.addons : []).filter((a) => ADDONS[a]);

  if (!sp || !m || !hours.length || !name || !isEmail(email) || phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ ok: false, error: "Missing or invalid booking details" });
  }
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const start0 = istToUtc(y, mo, d, hours[0]);
  const now = Date.now();
  if (start0.getTime() < now - 5 * 60000 || start0.getTime() > now + 60 * 86400000) {
    return res.status(400).json({ ok: false, error: "That time is in the past or too far ahead" });
  }

  const hrs = hours.length, base = sp.rate * hrs;
  const disc = hrs >= DEAL_HRS ? Math.round((base * DEAL_PCT) / 100) : 0;
  let add = 0, quote = false;
  addons.forEach((a) => { if (ADDONS[a].rate) add += ADDONS[a].rate * hrs; else quote = true; });
  const total = base - disc + add;

  const dateObj = new Date(Date.UTC(y, mo - 1, d));
  const dateLabel = `${WD[dateObj.getUTCDay()]} ${d} ${MO[mo - 1]} ${y}`;
  const rs = ranges(hours);
  const hoursLabel = rs.map(([a, z]) => `${pad(a)}:00–${pad(z)}:00`).join(", ") + ` (${hrs}h)`;
  const ref = `BWS-${pad(mo)}${pad(d)}-${pad(hours[0])}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const addonLabel = addons.map((a) => ADDONS[a].name).join(", ") || "None";

  const details = [
    ["Booking ref", ref], ["Space", sp.name], ["Date", dateLabel], ["Time", hoursLabel], ["People", String(people)],
    ["Add-ons", addonLabel], ["Studio", inr(base)], ["4+ hour discount", disc ? "−" + inr(disc) : ""],
    ["Add-ons cost", add ? inr(add) : ""], ["Estimate", inr(total) + (quote ? " + editing quote" : "")],
    ["Name", name], ["Email", email], ["WhatsApp", phone], ["Note", note],
  ];

  // Calendar invite: one event per continuous block of hours.
  const stamp = icsTime(new Date());
  const desc = `${sp.name} booking ${ref}\nPeople: ${people}\nAdd-ons: ${addonLabel}\nEstimate: ${inr(total)}${quote ? " + editing quote" : ""}\nBooked by: ${name}, ${phone}\nQuestions: WhatsApp ${PHONE}`;
  const events = rs.map(([a, z], i) => [
    "BEGIN:VEVENT",
    `UID:${ref}-${i}@bigwebstudios.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(istToUtc(y, mo, d, a))}`,
    `DTEND:${icsTime(istToUtc(y, mo, d, z))}`,
    `SUMMARY:${icsText(`Big Web Studios · ${sp.name} (${name})`)}`,
    `LOCATION:${icsText(ADDRESS)}`,
    `DESCRIPTION:${icsText(desc)}`,
    `ORGANIZER;CN=Big Web Studios:mailto:${OWNER}`,
    `ATTENDEE;CN=${icsText(name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`,
    `ATTENDEE;CN=Big Web Studios;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${OWNER}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${icsText("Your Big Web Studios session starts in 2 hours")}`, "END:VALARM",
    "END:VEVENT",
  ]).flat();
  const ics = ["BEGIN:VCALENDAR", "PRODID:-//Big Web Studios//Booking//EN", "VERSION:2.0", "CALSCALE:GREGORIAN", "METHOD:REQUEST", ...events, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";

  const rulesHtml = `<h2 style="font-size:16px;margin:22px 0 8px">Studio rules and policy</h2><ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.55;color:#16131F">${RULES.map((r) => `<li style="margin-bottom:6px">${esc(r)}</li>`).join("")}</ol>`;
  const findHtml = `<h2 style="font-size:16px;margin:22px 0 8px">Finding us</h2><p style="font-size:14px;line-height:1.55;margin:0">${esc(ADDRESS)}<br><a href="${MAPS}" style="color:#1680B0">Get directions in Google Maps</a> · WhatsApp ${PHONE} if you can't find the entrance.</p>`;

  try {
    await send({
      to: email,
      replyTo: OWNER,
      subject: `Booked: ${sp.name}, ${dateLabel}, ${rs.map(([a, z]) => `${pad(a)}:00–${pad(z)}:00`).join(", ")}`,
      html: layout(
        "Your session is booked",
        `<p style="font-size:15px;line-height:1.55">Hi ${esc(name)}, your time at Big Web Studios is blocked. The calendar invite is attached, so tap <b>Yes</b> or <b>Add to calendar</b> to save it. Pay at the studio or by UPI when you arrive.</p>` +
          rows(details) + rulesHtml + findHtml +
          `<p style="font-size:14px;line-height:1.55;margin-top:20px">Need to change something? Reply to this email or WhatsApp ${PHONE}.</p>`
      ),
      text: `Hi ${name}, your Big Web Studios session is booked.\n\n` + details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nStudio rules:\n" + RULES.map((r, i) => `${i + 1}. ${r}`).join("\n") + `\n\n${ADDRESS}\nWhatsApp ${PHONE}`,
      ics,
    });
    await send({
      to: OWNER,
      replyTo: email,
      subject: `New booking ${ref}: ${sp.name}, ${dateLabel}, ${hoursLabel}`,
      html: layout(`New booking: ${esc(name)}`, rows(details) + `<p style="font-size:14px">The calendar invite is attached. Reply to this email to reach ${esc(name)}.</p>`),
      text: details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n"),
      ics,
      fromName: "Big Web Studios website",
    });
    return res.status(200).json({ ok: true, ref });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Could not send email", ...(process.env.VERCEL_ENV === "preview" ? { detail: String((e && e.message) || e).replace(/[A-Za-z0-9]{4}( ?[A-Za-z0-9]{4}){3}/g, "****").slice(0, 300) } : {}) });
  }
};
