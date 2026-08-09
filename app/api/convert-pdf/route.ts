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

const SYSTEM_PROMPT = `You are a document converter for a marine charter business platform. Convert raw PDF text into clean, professional, well-structured HTML that looks like a proper legal document when rendered.

## Critical Rules:
1. Output ONLY the HTML content — no markdown, no code fences, no explanations, no comments.
2. NEVER replace actual names of people or companies in the document. Keep them exactly as they appear.
3. Only use template variables (like {{signer_name}}) where there are fill-in blanks (_____, ------, dotted lines) — never to replace existing text.
4. Keep ALL original legal content — do not summarize, omit, or rephrase anything.
5. Fix OCR/extraction artifacts: missing spaces between words, broken line wraps, garbled characters.

## HTML Structure Requirements:
- Wrap each numbered/titled section in a <section> tag
- Use <h2> for main section headings (e.g., "1. BOOKING DETAILS", "PAYMENT TERMS")
- Use <h3> for sub-headings within sections
- Use <p> for paragraphs — each paragraph should be a complete thought, not a single line
- Use <ol type="a"> for lettered items (a, b, c), <ol> for numbered items, <ul> for bullets
- Use <strong> to highlight important terms, names, amounts, and template variables
- Combine related short lines into proper flowing paragraphs — do NOT make each line a separate <p>
- Group booking/reservation details into a clean paragraph, not separate lines

## Available template variables (use double curly braces, only for blank fields):
${TEMPLATE_VARIABLES.map(v => `- {{${v.key}}} — ${v.description}`).join('\n')}

## Example of the EXACT format expected:

<section>
<h2>1. BOOKING DETAILS</h2>
<p>Customer Name: <strong>John Smith</strong>. Email: <strong>john@example.com</strong>. Phone: <strong>(305) 555-1234</strong>. Vessel: <strong>Sea Ray 34 SCR</strong>. Date: <strong>{{charter_date}}</strong>. Start Time: <strong>{{departure_time}}</strong>. End Time: <strong>{{end_time}}</strong>. Number of Guests: Up to 13. Deposit Paid (30%): <strong>{{deposit_amount}}</strong>. Balance Due (70%): Due before boarding at the marina.</p>
</section>

<section>
<h2>2. PAYMENT TERMS</h2>
<ol type="a">
<li>A non-refundable deposit of 30% of the total rental amount confirms your reservation.</li>
<li>The remaining 70% balance must be paid before boarding on the day of the rental. Accepted: cash, credit card, or debit card.</li>
<li>Failure to pay the balance before boarding may result in cancellation without refund of the deposit.</li>
</ol>
</section>

<section>
<h2>3. CANCELLATION POLICY</h2>
<ol type="a">
<li>More than 72 hours before rental: deposit applied as credit for a future rental within 90 days.</li>
<li>Within 72 hours of rental: deposit is forfeited and non-refundable.</li>
<li>No-show: full deposit is forfeited.</li>
<li>Weather cancellation initiated by the operator: full credit or rescheduling at no additional charge.</li>
</ol>
</section>

<section>
<h2>4. RULES & REGULATIONS ON BOARD</h2>
<p>By signing this agreement, the guest agrees to the following rules for all guests in their party:</p>
<ol type="a">
<li>Maximum vessel capacity must not be exceeded at any time.</li>
<li>All guests must wear life jackets when required by the captain.</li>
<li>No swimming from the vessel unless anchored in a safe area and approved by the captain.</li>
<li>Alcohol is permitted in moderation. No visibly intoxicated guests will be allowed on board.</li>
<li>No illegal substances are permitted on board.</li>
<li>The captain's decisions are final regarding safety and navigation.</li>
</ol>
</section>

<section>
<h2>5. LIABILITY WAIVER & ASSUMPTION OF RISK</h2>
<p>I, the undersigned, acknowledge that boating activities involve inherent risks including but not limited to drowning, injury, illness, property damage, and death. I voluntarily assume all risks associated with this rental activity.</p>
<p>I hereby release, waive, discharge, and covenant not to sue the charter company, its owners, officers, agents, employees, and representatives from any and all liability, claims, demands, actions, or causes of action arising out of or related to any loss, damage, injury, or death that may occur during the rental period.</p>
<p>I confirm that all guests in my party have been informed of and agree to these terms. I accept full responsibility for the conduct and safety of all guests in my party.</p>
</section>

<section>
<h2>6. DAMAGE POLICY</h2>
<p>The guest is responsible for any damage to the vessel or equipment caused by negligence or misuse during the rental period. The charter company reserves the right to charge the payment method on file for any repair costs incurred.</p>
</section>

Follow this structure precisely. Every waiver or contract should have clearly numbered sections, proper lists, and flowing paragraphs — never a wall of disconnected lines.`;

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
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      let detail = 'AI conversion failed.';
      try {
        const errJson = JSON.parse(errText);
        detail = errJson?.error?.message || detail;
      } catch { /* ignore */ }
      return NextResponse.json(
        { error: detail },
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
