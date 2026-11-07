// POST /api/enquiry
// Emails the enquiry to Big Web Studios and a confirmation copy to the sender.
const { OWNER, PHONE, esc, isEmail, clean, send, layout, rows, readBody } = require("./_mail");

const TYPES = {
  artist: "Artist enquiry",
  creator: "Creator enquiry",
  brand: "Brand enquiry",
  event: "Event enquiry",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });
  const b = readBody(req);
  if (b.website) return res.status(200).json({ ok: true }); // spam trap filled in by bots

  const type = TYPES[b.type] ? b.type : null;
  const name = clean(b.name, 120);
  const email = clean(b.email, 200);
  const phone = clean(b.phone, 30);
  const fields = Array.isArray(b.fields) ? b.fields.slice(0, 12).map(([k, v]) => [clean(k, 60), clean(v, 2000)]) : [];
  if (!type || !name || !isEmail(email) || phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ ok: false, error: "Missing or invalid details" });
  }
  const label = TYPES[type];
  const details = [["Name", name], ["Email", email], ["WhatsApp", phone], ...fields];
  const wa = "https://wa.me/" + phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");

  try {
    await send({
      to: OWNER,
      replyTo: email,
      subject: `New ${label.toLowerCase()}: ${name}`,
      html: layout(`New ${label.toLowerCase()}`, rows(details) + `<p style="font-size:14px">Reply to this email to answer ${esc(name)} directly, or <a href="${wa}" style="color:#1680B0">message them on WhatsApp</a>.</p>`),
      text: details.map(([k, v]) => `${k}: ${v}`).join("\n"),
    });
    await send({
      to: email,
      replyTo: OWNER,
      subject: `We got your enquiry, ${name.split(" ")[0]}`,
      html: layout(
        "Thanks, we got your enquiry",
        `<p style="font-size:15px;line-height:1.55">Hi ${esc(name)}, thanks for reaching out to Big Web Studios. Here's a copy of what you sent. We'll get back to you within 1–2 working days, usually on WhatsApp.</p>` +
          rows(details) +
          `<p style="font-size:14px;line-height:1.55">Need us sooner? WhatsApp us on <a href="https://wa.me/919871920493" style="color:#1680B0">${PHONE}</a>, or just reply to this email.</p>`
      ),
      text: `Hi ${name}, thanks for reaching out to Big Web Studios. We'll get back to you within 1–2 working days.\n\n` + details.map(([k, v]) => `${k}: ${v}`).join("\n"),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Could not send email" });
  }
};
