// Shared helpers for the enquiry and booking endpoints.
// Needs the RESEND_API_KEY environment variable in Vercel.

const OWNER = process.env.OWNER_EMAIL || "bigwebstudio.com@gmail.com";
const FROM = process.env.FROM_EMAIL || "Big Web Studios <bookings@bigwebstudios.com>";
const SITE = "https://www.bigwebstudios.com";
const PHONE = "+91 98719 20493";
const ADDRESS = "Plot 45, Qutub Vihar Phase 1, opp. Dwarka Sector 19, New Delhi 110071";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isEmail = (s) => typeof s === "string" && s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const clean = (s, max = 2000) => String(s ?? "").replace(/\r/g, "").trim().slice(0, max);

async function send({ to, subject, html, text, replyTo, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: replyTo, attachments }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()).slice(0, 300));
  return r.json();
}

// Simple branded wrapper for every email.
function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#F5F4F8;font-family:Arial,Helvetica,sans-serif;color:#16131F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#16131F;padding:18px 24px"><span style="font-size:20px;font-weight:800;color:#F5F4F8">bigweb</span> <span style="font-size:11px;letter-spacing:4px;color:#FEC200">STUDIOS</span></td></tr>
<tr><td style="height:6px;background:linear-gradient(90deg,#40BEEE 0 33%,#9255A2 33% 66%,#FEC200 66%)"></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#F5F4F8;font-size:12px;color:#5E5970">Big Web Studios · From the studio to the spotlight<br>${esc(ADDRESS)}<br>WhatsApp / phone ${PHONE} · <a href="${SITE}" style="color:#1680B0">bigwebstudios.com</a> · <a href="https://www.instagram.com/bigwebstudios/" style="color:#1680B0">@bigwebstudios</a></td></tr>
</table></td></tr></table></body></html>`;
}

// Renders rows of [label, value] as a table.
function rows(list) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 16px">${list
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `<tr><td style="padding:8px 10px 8px 0;color:#5E5970;border-bottom:1px dashed #DEDAE8;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px dashed #DEDAE8;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("")}</table>`;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = { OWNER, SITE, PHONE, ADDRESS, esc, isEmail, clean, send, layout, rows, readBody };
