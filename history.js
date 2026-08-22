import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HISTORY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'history.json');

export async function loadHistory() {
  try {
    const raw = await readFile(HISTORY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export function updateHistory(history, fares) {
  const updated = { ...history };
  for (const fare of fares) {
    const existing = updated[fare.departureDate];
    if (!existing || fare.amount < existing.amount) {
      updated[fare.departureDate] = {
        amount: fare.amount,
        currency: fare.currency,
        airline: fare.airline,
        seenAt: new Date().toISOString().slice(0, 10),
      };
    }
  }
  return updated;
}

export async function saveHistory(history) {
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}
