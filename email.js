import { Resend } from 'resend';
import { ORIGIN, DESTINATION } from './fetch.js';

const BRAND_TEAL = '#0a7d8c';
const CARD_BG = '#f0f7f7';
const TEXT_GRAY = '#4b4b4b';
const DEPART_MAD_COLOR = '#1f9d55'; // departure day from Madrid
const DEPART_DPS_COLOR = '#d9720c'; // departure day from Bali
const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };
const OUTBOUND_STYLE_LABELS = {
  'friday-night': 'Fri night out · Sat evening back',
  'saturday-morning': 'Sat morning out · Sat evening back',
};

// Media queries only take effect from a <style> block, not inline styles,
// so anything that needs to change on small screens (stacking the
// airline/price row, shrinking padding and font sizes) is hooked up via
// these classes and overridden below with !important.
const RESPONSIVE_STYLES = `
  @media screen and (max-width: 480px) {
    .misurf-card-pad { padding: 24px !important; }
    .misurf-title { font-size: 26px !important; }
    .misurf-deal-row td { display: block !important; width: 100% !important; }
    .misurf-deal-airline, .misurf-deal-price {
      font-size: 24px !important;
      padding: 0 !important;
    }
    .misurf-deal-price { text-align: left !important; padding-top: 4px !important; }
  }
`;

function formatPrice(deal) {
  const symbol = CURRENCY_SYMBOLS[deal.currency] ?? `${deal.currency} `;
  return `${deal.amount.toFixed(2)} ${symbol}`;
}

function formatDateWithColoredDay(dateStr, color) {
  const [year, month, day] = dateStr.split('-');
  return `${year}-${month}-<span style="color:${color};font-weight:700;">${day}</span>`;
}

function googleFlightsUrl(deal) {
  const query = `Flights from ${ORIGIN} to ${DESTINATION} on ${deal.departureDate} through ${deal.returnDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

function formatDeal(deal) {
  return `
  <tr>
    <td style="padding:0 0 24px 0;">
      <a href="${googleFlightsUrl(deal)}" style="display:block;text-decoration:none;color:inherit;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border-radius:24px;">
          <tr>
            <td class="misurf-card-pad" style="padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:16px;color:#000000;padding-bottom:4px;">
                    ${formatDateWithColoredDay(deal.departureDate, DEPART_MAD_COLOR)} &nbsp;&rarr;&nbsp; ${formatDateWithColoredDay(deal.returnDate, DEPART_DPS_COLOR)}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:13px;color:${TEXT_GRAY};padding-bottom:12px;">
                    ${OUTBOUND_STYLE_LABELS[deal.outboundStyle] ?? ''}
                  </td>
                </tr>
                <tr class="misurf-deal-row">
                  <td style="padding-bottom:12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="misurf-deal-airline" style="font-family:${FONT_STACK};font-size:32px;font-weight:700;color:#000000;">
                          ${deal.airline}
                        </td>
                        <td class="misurf-deal-price" style="font-family:${FONT_STACK};font-size:32px;font-weight:400;color:#000000;text-align:right;white-space:nowrap;">
                          ${formatPrice(deal)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:16px;color:${TEXT_GRAY};">
                    ${deal.reason}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>
    </td>
  </tr>`;
}

export function buildHtml(deals) {
  const header = `
  <tr>
    <td style="text-align:center;padding:0 0 32px 0;">
      <div class="misurf-title" style="font-family:${FONT_STACK};font-size:32px;font-weight:700;color:${BRAND_TEAL};">
        🏄 MISURF
      </div>
      <div style="font-family:${FONT_STACK};font-size:16px;color:${TEXT_GRAY};padding-top:4px;">
        ${ORIGIN} &rarr; ${DESTINATION} · 5 vacation days, redeye home, 1 stop each way
      </div>
    </td>
  </tr>`;

  const body =
    deals.length > 0
      ? deals.map(formatDeal).join('')
      : `
  <tr>
    <td class="misurf-card-pad" style="padding:32px;background:${CARD_BG};border-radius:24px;text-align:center;font-family:${FONT_STACK};font-size:16px;color:${TEXT_GRAY};">
      No standout deals today for ${ORIGIN} &rarr; ${DESTINATION}.
    </td>
  </tr>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px 0 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          ${header}
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendDealsEmail(deals) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!process.env.TO_EMAIL) {
    throw new Error('TO_EMAIL is not set');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const recipients = process.env.TO_EMAIL.split(',').map((email) => email.trim());

  const { error } = await resend.emails.send({
    from: 'misurf <onboarding@resend.dev>',
    to: recipients,
    subject:
      deals.length > 0
        ? `${ORIGIN}→${DESTINATION}: ${deals.length} deal${deals.length > 1 ? 's' : ''} worth a look`
        : `${ORIGIN}→${DESTINATION}: nothing special today`,
    html: buildHtml(deals),
  });

  if (error) {
    throw new Error(`Resend failed to send email: ${JSON.stringify(error)}`);
  }
}
