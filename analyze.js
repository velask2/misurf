import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

function buildPrompt(fares, history) {
  return `You are helping pick the best flight deals for a MAD-DPS (Madrid to Bali) round trip.

Every fare below is for the same trip pattern: fly out Friday afternoon (a
normal workday, so no vacation time spent on it), and fly home the following
Saturday evening, which lands back in Madrid on the Sunday (the route is
long enough that the return is a "+1" day). That means the trip covers both
full weekends at the destination while only costing 5 vacation days
(Mon-Fri) -- so don't factor trip length into "value", just price. Every
fare is also restricted to exactly one stop each way.

Today's fares (lowest one-stop price found per Saturday departure date):
${JSON.stringify(fares, null, 2)}

Price history (date -> lowest fare ever seen, from previous runs):
${JSON.stringify(history, null, 2)}

Pick the 3-5 best deals from today's fares. A "good" deal is one that stands out
against the price history for that date or nearby dates (e.g. notably below the
recent average, or the cheapest seen so far for that date). If fewer than 3
fares look like genuinely good deals, return fewer — don't pad the list.

Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{
  "departureDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD",
  "amount": number,
  "currency": "EUR",
  "airline": "string",
  "reason": "one short plain-language sentence, e.g. '30% below the 30-day average'"
}`;
}

export async function analyzeFares(fares, history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (fares.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(fares, history) }],
  });

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/```\s*$/, '');

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Could not parse Claude's response as JSON: ${text}`);
  }
}
