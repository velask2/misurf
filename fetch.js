import { setTimeout as sleep } from 'node:timers/promises';

const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests';
export const ORIGIN = 'MAD';
export const DESTINATION = 'DPS'; // Denpasar (Bali), Ngurah Rai Intl.

// The trip pattern: fly out either Friday evening or Saturday, work Mon-Fri
// the following week, fly home the following Saturday -- whichever option
// (and whichever airline/routing) is cheapest wins. Every itinerary is
// restricted to exactly one stop each way, with a layover no longer than
// MAX_CONNECTION_MINUTES.
const SEARCH_YEAR = 2026;
const SEARCH_MONTH = 9; // September
const MAX_CONNECTIONS = 1; // exactly one stop each way, no direct, no 2-stop
const MAX_CONNECTION_MINUTES = 180; // layover no longer than 3 hours, both ways

// "Friday evening" MAD departure -- at/after this local hour. The Saturday
// outbound option has no time-of-day restriction, and neither does the
// Saturday return -- just cheapest, same 1-stop/layover rules.
const FRIDAY_EVENING_MIN_HOUR = 18;

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

// Two outbound options per week: the Friday evening before the anchor
// Saturday, or the anchor Saturday itself. Both return the following
// Saturday (7-8 days later).
function tripCandidates() {
  const candidates = [];
  for (const anchorSaturday of saturdaysInMonth(SEARCH_YEAR, SEARCH_MONTH)) {
    const returnDate = addDays(anchorSaturday, 7);
    candidates.push({
      label: 'friday-evening',
      departureDate: addDays(anchorSaturday, -1),
      returnDate,
      minDepartHour: FRIDAY_EVENING_MIN_HOUR,
    });
    candidates.push({
      label: 'saturday',
      departureDate: anchorSaturday,
      returnDate,
      minDepartHour: null,
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

// Layover length: time between landing on the first segment and taking off
// on the second. Both timestamps are local to the connecting airport, so a
// plain subtraction is safe even across a local midnight.
function connectionMinutes(slice) {
  const arrival = new Date(slice.segments[0].arriving_at);
  const departure = new Date(slice.segments[1].departing_at);
  return (departure - arrival) / 60000;
}

function hasShortConnections(offer) {
  return offer.slices.every((slice) => connectionMinutes(slice) <= MAX_CONNECTION_MINUTES);
}

function departureHour(offer, sliceIndex) {
  const firstSegment = offer.slices[sliceIndex].segments[0];
  return Number(firstSegment.departing_at.slice(11, 13));
}

function meetsTimeWindow(offer, candidate) {
  if (candidate.minDepartHour == null) return true;
  return departureHour(offer, 0) >= candidate.minDepartHour;
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
      const eligible = offers.filter(
        (offer) => hasOneStopEachWay(offer) && hasShortConnections(offer) && meetsTimeWindow(offer, candidate),
      );
      const cheapest = lowestFare(eligible);
      if (cheapest) {
        fares.push({ departureDate, returnDate, outboundStyle: label, ...cheapest });
      } else if (offers.length > 0) {
        console.warn(`No eligible (1-stop, <=3h layover, right time of day) offers for ${departureDate} -> ${returnDate} [${label}]`);
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
