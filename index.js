import { fetchFares } from './fetch.js';
import { loadHistory, updateHistory, saveHistory } from './history.js';
import { analyzeFares } from './analyze.js';
import { sendDealsEmail } from './email.js';

async function main() {
  console.log('Fetching MAD → DPS one-stop fares for September Saturday departures...');
  const fares = await fetchFares();
  console.log(`Found fares for ${fares.length} departure dates.`);

  const history = await loadHistory();

  console.log('Asking Claude to pick the best deals...');
  const deals = await analyzeFares(fares, history);
  console.log(`Claude picked ${deals.length} deals.`);

  console.log('Sending email...');
  await sendDealsEmail(deals);
  console.log('Email sent.');

  const updatedHistory = updateHistory(history, fares);
  await saveHistory(updatedHistory);
  console.log('history.json updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
