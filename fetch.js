import { setTimeout as sleep } from 'node:timers/promises';

const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests';
export const ORIGIN = 'MAD';
export const DESTINATION = 'DPS'; // Denpasar (Bali), Ngurah Rai Intl.

// The trip pattern: fly out on a Saturday, work Mon-Fri the following week,
// fly home on the Sunday after that -- 9 days off using only 5 vacation
// days, bookended by both weekends.
const SEARCH_YEAR = 2026;
const SEARCH_MONTH = 9; // September
const TRIP_NIGHTS = 8; // Sat -> Sun, 8 nights later (2 weekends + 5 workdays)
const MAX_CONNECTIONS = 1; // exactly one stop each way, no direct, no 2-stop

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

// One candidate per Saturday in the search month: depart that Saturday,
// return TRIP_NIGHTS later (the Sunday after the following work week).
function tripCandidates() {
  return saturdaysInMonth(SEARCH_YEAR, SEARCH_MONTH).map((departureDate) => ({
    departureDate,
    returnDate: addDays(departureDate, TRIP_NIGHTS),
  }));
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

  for (const { departureDate, returnDate } of tripCandidates()) {
    try {
      const offers = await requestOffers(departureDate, returnDate);
      const eligible = offers.filter(hasOneStopEachWay);
      const cheapest = lowestFare(eligible);
      if (cheapest) {
        fares.push({ departureDate, returnDate, ...cheapest });
      } else if (offers.length > 0) {
        console.warn(`No one-stop-each-way offers for ${departureDate} -> ${returnDate}`);
      } else {
        console.warn(`No offers found for ${departureDate} -> ${returnDate}`);
      }
    } catch (err) {
      console.error(err.message);
    }
    await sleep(300); // be polite to the API between requests
  }

  return fares;
}
