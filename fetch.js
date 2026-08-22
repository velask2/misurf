import { setTimeout as sleep } from 'node:timers/promises';

const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests';
export const ORIGIN = 'MAD';
export const DESTINATION = 'DPS'; // Denpasar (Bali), Ngurah Rai Intl.

// The trip pattern: fly out Friday night or Saturday morning, work Mon-Fri
// the following week, fly home on the Saturday evening after that (a redeye
// that lands back in Madrid Sunday morning). Still only 5 vacation days
// (Mon-Fri), both weekends are free, and the overnight return means Sunday
// is spent recovering at home instead of in transit.
const SEARCH_YEAR = 2026;
const SEARCH_MONTH = 9; // September
const MAX_CONNECTIONS = 1; // exactly one stop each way, no direct, no 2-stop

// Local-time-of-day windows (24h, airport-local, matching Duffel's
// segment departing_at format) that qualify as "Friday night", "Saturday
// morning", and "Saturday evening" departures.
const FRIDAY_NIGHT_MIN_HOUR = 18; // MAD departure must be at/after 18:00
const SATURDAY_MORNING_MAX_HOUR = 12; // MAD departure must be before 12:00
const SATURDAY_EVENING_MIN_HOUR = 17; // DPS departure must be at/after 17:00

function saturdaysInMonth(year, month) {
  const dates = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Two outbound options per week: fly out the Friday night before the first
// weekend, or the Saturday morning that starts it. Either way, return is
// the following Saturday evening (7-8 days later) -- one candidate object
// per option, sharing the same return date.
function tripCandidates() {
  const candidates = [];
  for (const anchorSaturday of saturdaysInMonth(SEARCH_YEAR, SEARCH_MONTH)) {
    const returnDate = addDays(anchorSaturday, 7);
    candidates.push({
      label: 'friday-night',
      departureDate: addDays(anchorSaturday, -1),
      returnDate,
      minDepartHour: FRIDAY_NIGHT_MIN_HOUR,
      maxDepartHour: null,
    });
    candidates.push({
      label: 'saturday-morning',
      departureDate: anchorSaturday,
      returnDate,
      minDepartHour: null,
      maxDepartHour: SATURDAY_MORNING_MAX_HOUR,
    });
  }
  return candidates;
}

async function requestOffers(departureDate, returnDate) {
  const body = {
    data: {
      slices: [
        { origin: ORIGIN, destination: DESTINATION, departure_date: departureDate, max_connections: MAX_CONNECTIONS },
        { origin: DESTINATION, destination: ORIGIN, departure_date: returnDate, max_connections: MAX_CONNECTIONS },
      ],
      passengers: [{ type: 'adult' }],
      cabin_class: 'economy',
    },
  };

  const res = await fetch(`${DUFFEL_API_URL}?return_offers=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Duffel request failed for ${departureDate} -> ${returnDate}: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.data?.offers ?? [];
}

// Belt-and-braces on top of max_connections: only keep offers where both
// slices actually have exactly one stop (two segments).
function hasOneStopEachWay(offer) {
  return offer.slices.every((slice) => slice.segments.length === MAX_CONNECTIONS + 1);
}

function departureHour(offer, sliceIndex) {
  const firstSegment = offer.slices[sliceIndex].segments[0];
  return Number(firstSegment.departing_at.slice(11, 13));
}

function meetsTimeWindow(offer, candidate) {
  const outboundHour = departureHour(offer, 0);
  const returnHour = departureHour(offer, 1);

  if (candidate.minDepartHour != null && outboundHour < candidate.minDepartHour) return false;
  if (candidate.maxDepartHour != null && outboundHour >= candidate.maxDepartHour) return false;
  if (returnHour < SATURDAY_EVENING_MIN_HOUR) return false;

  return true;
}

function lowestFare(offers) {
  if (offers.length === 0) return null;
  return offers.reduce(
    (lowest, offer) => {
      const amount = parseFloat(offer.total_amount);
      return amount < lowest.amount
        ? { amount, currency: offer.total_currency, airline: offer.owner?.name ?? 'unknown' }
        : lowest;
    },
    { amount: Infinity, currency: null, airline: null },
  );
}

export async function fetchFares() {
  if (!process.env.DUFFEL_API_KEY) {
    throw new Error('DUFFEL_API_KEY is not set');
  }

  const fares = [];

  for (const candidate of tripCandidates()) {
    const { departureDate, returnDate, label } = candidate;
    try {
      const offers = await requestOffers(departureDate, returnDate);
      const eligible = offers.filter((offer) => hasOneStopEachWay(offer) && meetsTimeWindow(offer, candidate));
      const cheapest = lowestFare(eligible);
      if (cheapest) {
        fares.push({ departureDate, returnDate, outboundStyle: label, ...cheapest });
      } else if (offers.length > 0) {
        console.warn(`No eligible (1-stop, right time of day) offers for ${departureDate} -> ${returnDate} [${label}]`);
      } else {
        console.warn(`No offers found for ${departureDate} -> ${returnDate} [${label}]`);
      }
    } catch (err) {
      console.error(err.message);
    }
    await sleep(300); // be polite to the API between requests
  }

  return fares;
}
