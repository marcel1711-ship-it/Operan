import { NextRequest, NextResponse } from 'next/server';

const TEMPLATE_VARIABLES = [
  { key: 'signer_name', description: 'Full name of the person signing (filled from registration form)' },
  { key: 'email', description: 'Email of the signer (filled from registration form)' },
  { key: 'phone', description: 'Phone number of the signer (filled from registration form)' },
  { key: 'vessel_name', description: 'Name of the boat/vessel (auto-filled from reservation)' },
  { key: 'charter_date', description: 'Date of the charter/rental (auto-filled from reservation)' },
  { key: 'departure_time', description: 'Departure/start time (auto-filled from reservation)' },
  { key: 'end_time', description: 'End/return time (auto-filled from reservation)' },
  { key: 'guest_count', description: 'Number of guests (auto-filled from reservation)' },
  { key: 'booking_reference', description: 'Reservation/booking reference number (auto-filled)' },
  { key: 'company_name', description: 'Name of the charter company/tenant (auto-filled)' },
  { key: 'today', description: 'Current date when the document is signed (auto-filled)' },
  { key: 'deposit_amount', description: 'Deposit amount paid (auto-filled from reservation if available)' },
  { key: 'total_amount', description: 'Total rental/charter amount (auto-filled from reservation if available)' },
];

const SYSTEM_PROMPT = `You are a document converter for a marine charter business platform. Your job is to convert raw text extracted from PDF waivers and contracts into clean, well-structured HTML.

## Rules:
1. Output ONLY the HTML content — no markdown, no code fences, no explanations.
2. Use semantic HTML: <section>, <h2>, <h3>, <p>, <ol>, <ul>, <li>, <strong>.
3. Wrap each major section (numbered or titled) in a <section> tag with an <h2>.
4. Use <ol type="a"> for lettered sub-items, <ol> for numbered items, <ul> for bullets.
5. Fix any OCR/extraction artifacts: missing spaces between words, broken line wraps, garbled characters.
6. Keep ALL original legal content — do not summarize, omit, or rephrase anything.
7. Replace ONLY fill-in blanks (_____, ------, dotted lines) with the appropriate template variable from the list below.
8. NEVER replace actual names of people or companies that appear in the document. These are part of the original contract and must stay as-is. For example if the document says "LAZARO LOPEZ" or "BBR Boat Rentals", keep those exact names.
9. Only use {{signer_name}} or {{company_name}} where there is a blank line/underscore meant to be filled in — never to replace an existing name.
10. Dates that should be filled at signing time (blank date fields) → {{today}}. Blank charter/rental date fields → {{charter_date}}. Dates already written in the document must stay as-is.

## Available template variables (use double curly braces):
${TEMPLATE_VARIABLES.map(v => `- {{${v.key}}} — ${v.description}`).join('\n')}

## HTML structure example:
<section>
  <h2>1. BOOKING DETAILS</h2>
  <p>This agreement is between <strong>{{company_name}}</strong> and <strong>{{signer_name}}</strong> for a charter aboard <strong>{{vessel_name}}</strong> on <strong>{{charter_date}}</strong>.</p>
</section>
<section>
  <h2>2. PAYMENT TERMS</h2>
  <ol type="a">
    <li>A deposit of {{deposit_amount}} confirms the reservation.</li>
    <li>The balance is due before boarding.</li>
  </ol>
</section>`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY_OPERAN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 }
    );
  }

  let body: { text: string; documentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { text, documentType = 'waiver' } = body;

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing text field' }, { status: 400 });
  }

  if (text.length > 50000) {
    return NextResponse.json({ error: 'Text too long (max 50,000 characters)' }, { status: 400 });
  }

  const userPrompt = `Convert this ${documentType} PDF text into clean structured HTML with template variables. Fix all spacing issues and formatting problems from the PDF extraction:\n\n${text}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return NextResponse.json(
        { error: 'AI conversion failed. Please try again.' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const html = data.content?.[0]?.text || '';

    return NextResponse.json({
      html,
      variables: TEMPLATE_VARIABLES,
    });
  } catch (err) {
    console.error('Convert PDF error:', err);
    return NextResponse.json(
      { error: 'Failed to convert document' },
      { status: 500 }
    );
  }
}
