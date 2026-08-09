export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  type: 'waiver' | 'contract';
  html: string;
};

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'guest-waiver',
    name: 'Guest Liability Waiver',
    description: 'Standard liability waiver and assumption of risk for guests',
    type: 'waiver',
    html: `<section>
<h2>1. BOOKING DETAILS</h2>
<p>Customer Name: <strong>{{signer_name}}</strong>. Email: <strong>{{email}}</strong>. Phone: <strong>{{phone}}</strong>. Vessel: <strong>{{vessel_name}}</strong>. Date: <strong>{{charter_date}}</strong>. Start Time: <strong>{{departure_time}}</strong>. End Time: <strong>{{end_time}}</strong>. Number of Guests: <strong>{{guest_count}}</strong>. Deposit Paid: <strong>{{deposit_amount}}</strong>. Balance Due: Due before boarding at the marina.</p>
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
<h2>4. RULES &amp; REGULATIONS ON BOARD</h2>
<p>By signing this agreement, <strong>{{signer_name}}</strong> agrees to the following rules for all guests in their party:</p>
<ol type="a">
<li>Maximum vessel capacity must not be exceeded at any time.</li>
<li>All guests must wear life jackets when required by the captain.</li>
<li>No swimming from the vessel unless anchored in a safe area and approved by the captain.</li>
<li>Alcohol is permitted in moderation. No visibly intoxicated guests will be allowed on board.</li>
<li>No illegal substances are permitted on board.</li>
<li>The captain's decisions are final regarding safety and navigation.</li>
<li>All guests must arrive at the designated marina at least 10 minutes before the scheduled departure time.</li>
<li>No smoking inside the vessel. Designated smoking areas on deck only.</li>
<li>No cooking or BBQ allowed on board; only microwave reheating of previously prepared food.</li>
</ol>
</section>

<section>
<h2>5. LIABILITY WAIVER &amp; ASSUMPTION OF RISK</h2>
<p>I, <strong>{{signer_name}}</strong>, acknowledge that boating activities involve inherent risks including but not limited to drowning, injury, illness, property damage, and death. I voluntarily assume all risks associated with this rental activity.</p>
<p>I hereby release, waive, discharge, and covenant not to sue <strong>{{company_name}}</strong>, its owners, officers, agents, employees, and representatives from any and all liability, claims, demands, actions, or causes of action arising out of or related to any loss, damage, injury, or death that may occur during the rental period.</p>
<p>I confirm that all guests in my party have been informed of and agree to these terms. I accept full responsibility for the conduct and safety of all guests in my party.</p>
</section>

<section>
<h2>6. DAMAGE POLICY</h2>
<p><strong>{{signer_name}}</strong> is responsible for any damage to the vessel or equipment caused by negligence or misuse during the rental period. <strong>{{company_name}}</strong> reserves the right to charge the payment method on file for any repair costs incurred.</p>
</section>

<section>
<h2>7. PHOTO &amp; MEDIA CONSENT</h2>
<p>I consent to <strong>{{company_name}}</strong> using photos or videos taken during my rental for marketing purposes on social media and website.</p>
</section>

<section>
<h2>8. AGREEMENT &amp; SIGNATURE</h2>
<p>By signing below, I, <strong>{{signer_name}}</strong>, confirm that I have read, understood, and agree to all terms and conditions of this Rental Agreement and Liability Waiver for my rental on <strong>{{charter_date}}</strong>.</p>
<p>Signed on: <strong>{{today}}</strong></p>
<p>Signature: <strong>{{signer_signature}}</strong></p>
</section>`,
  },
  {
    id: 'bareboat-charter',
    name: 'Bareboat Charter Agreement',
    description: 'Charter agreement where the charterer operates the vessel',
    type: 'contract',
    html: `<section>
<h2>BAREBOAT CHARTER AGREEMENT</h2>
<p>This Yacht Charter Agreement (the "Agreement") is entered into by and between <strong>{{company_name}}</strong> (the "Owner") and <strong>{{signer_name}}</strong> (the "Charterer"), for a Yacht Charter aboard Motor <strong>{{vessel_name}}</strong>, effective <strong>{{charter_date}}</strong>.</p>
</section>

<section>
<h2>1. AGREEMENT PARTIES AND VESSEL DETAILS</h2>
<p>Date: <strong>{{charter_date}}</strong>. Place: <strong>{{meeting_location}}</strong>. Yacht name: <strong>{{vessel_name}}</strong>. Length: <strong>{{vessel_length}}</strong>. Type: <strong>{{vessel_type}}</strong>. Charterer: <strong>{{signer_name}}</strong>. Start time: <strong>{{departure_time}}</strong>. End time: <strong>{{end_time}}</strong>. Cruising area: <strong>{{cruising_area}}</strong>. Charter fee: <strong>{{charter_fee}}</strong>.</p>
</section>

<section>
<h2>2. DEPOSIT AND AGREEMENT</h2>
<p>The deposit required is <strong>{{deposit_amount}}</strong> unless otherwise arranged with <strong>{{company_name}}</strong>. The deposit is non-refundable except under the following circumstances:</p>
<ol type="a">
<li>The vessel becomes unfit for charter.</li>
<li>If a single-day charter is cancelled more than 72 hours prior to the commencement of the charter, or if a multiple-day charter is cancelled more than two weeks before the commencement of the charter and a cancellation confirmation number has been provided.</li>
<li>Up to a maximum of 50% if a multiple-day charter is cancelled at least one week before the charter and a cancellation confirmation number has been provided.</li>
<li>Extreme weather conditions prohibit the ability to fulfill the charter agreement.</li>
</ol>
</section>

<section>
<h2>3. PAYMENT</h2>
<p>Final payment is due <strong>15 minutes prior to the charter</strong>. The fee for this charter is <strong>{{charter_fee}}</strong>. Price includes: boat, inflatable, safety equipment, and life jackets. Meeting location: <strong>{{meeting_location}}</strong>.</p>
</section>

<section>
<h2>4. BOARDING TIMES</h2>
<p>Charterer shall be present and ready to board at least thirty (30) minutes prior to the scheduled departure time, to allow for the loading of provisions, instructions from the Captain, and other matters. <strong>{{company_name}}</strong> will supply instructions as to the time and place of boarding.</p>
</section>

<section>
<h2>5. DEMISE/BAREBOAT CHARTER</h2>
<p>This is a demised charter. The Charterer agrees to operate the vessel lawfully and in a safe and seaworthy manner. Charterer shall conform to all laws and regulations. Charterer agrees to indemnify, protect, defend, and hold harmless the Owner, the vessel, its registered owner, its master and crew, and their respective underwriters from and against the results of any breach by Charterer of the obligations or any other obligations imposed by law upon the Charterer.</p>
</section>

<section>
<h2>6. MASTER AND CREW SELECTION</h2>
<p>Charterer shall provide and pay for the master and crew of the vessel. The Charterer shall select and direct said master and crew. The duties of the crew shall be directed and controlled solely by the Charterer. The master of the vessel shall serve at the discretion of the Charterer.</p>
</section>

<section>
<h2>7. OWNER LIABILITY WAIVER</h2>
<p>The Owner shall not be liable for any loss, damage, or delay arising from any cause whatsoever, including but not limited to: acts of God, perils of the sea, fire, breakdown of machinery, war, civil commotion, or any cause beyond the Owner's reasonable control.</p>
</section>

<section>
<h2>8. INSURANCE</h2>
<p>The Owner warrants that the vessel is insured for the duration of the charter. The Charterer is responsible for any deductible amounts applicable in the event of a claim resulting from the Charterer's negligence.</p>
</section>

<section>
<h2>9. VESSEL SURVEY — PRE-CHARTER INSPECTION</h2>
<p>The Charterer shall inspect the vessel prior to departure and report any existing damage or deficiencies. Any unreported damage found after the charter may be charged to the Charterer.</p>
</section>

<section>
<h2>SIGNATURE AND ACKNOWLEDGMENT</h2>
<p>I have read and understand this Bareboat Charter Agreement in its entirety.</p>
<p>Charterer Signature: <strong>{{signer_signature}}</strong></p>
<p>Charterer Printed Name: <strong>{{signer_name}}</strong></p>
<p>Date: <strong>{{today}}</strong></p>
</section>`,
  },
  {
    id: 'captained-charter',
    name: 'Captained Charter Agreement',
    description: 'Charter agreement with captain and crew provided by owner',
    type: 'contract',
    html: `<section>
<h2>CAPTAINED CHARTER AGREEMENT</h2>
<p>This Charter Agreement (the "Agreement") is entered into by and between <strong>{{company_name}}</strong> (the "Operator") and <strong>{{signer_name}}</strong> (the "Client"), for a captained charter aboard <strong>{{vessel_name}}</strong>.</p>
</section>

<section>
<h2>1. CHARTER DETAILS</h2>
<p>Client Name: <strong>{{signer_name}}</strong>. Email: <strong>{{email}}</strong>. Phone: <strong>{{phone}}</strong>. Vessel: <strong>{{vessel_name}}</strong>. Date: <strong>{{charter_date}}</strong>. Departure: <strong>{{departure_time}}</strong>. Return: <strong>{{end_time}}</strong>. Number of Guests: <strong>{{guest_count}}</strong>. Meeting Point: <strong>{{meeting_location}}</strong>. Charter Fee: <strong>{{charter_fee}}</strong>.</p>
</section>

<section>
<h2>2. SERVICES PROVIDED</h2>
<p>The Operator will provide the vessel, a licensed USCG captain, and basic crew for the duration of the charter. The captain has final authority on all matters of safety and navigation. The charter includes: vessel, fuel for standard cruising, safety equipment, life jackets, basic cooler with ice, and Bluetooth sound system.</p>
</section>

<section>
<h2>3. PAYMENT TERMS</h2>
<ol type="a">
<li>A deposit of <strong>{{deposit_amount}}</strong> is required to confirm the reservation.</li>
<li>The remaining balance of <strong>{{total_amount}}</strong> is due before boarding on the day of the charter.</li>
<li>Accepted payment methods: cash, credit card, Zelle, or Venmo.</li>
<li>A crew gratuity of between 10–20% of the charter fee is customary, but at the client's sole discretion.</li>
</ol>
</section>

<section>
<h2>4. CANCELLATION POLICY</h2>
<ol type="a">
<li>More than 48 hours notice: full deposit credit toward a future charter within 90 days.</li>
<li>Less than 48 hours notice: deposit is forfeited.</li>
<li>No-show: full charter fee is due.</li>
<li>Weather cancellation by operator: full refund or rescheduling at no additional charge.</li>
</ol>
</section>

<section>
<h2>5. GUEST CONDUCT AND RULES</h2>
<ol type="a">
<li>Maximum vessel capacity must not be exceeded. Guests beyond the confirmed count will not be allowed to board.</li>
<li>All guests must follow the captain's instructions at all times.</li>
<li>Alcohol is permitted in moderation. The captain reserves the right to refuse boarding to visibly intoxicated guests.</li>
<li>No illegal substances are permitted on board.</li>
<li>No jumping from the vessel unless expressly permitted by the captain.</li>
<li>Guests are responsible for their personal belongings. The Operator is not liable for lost or damaged items.</li>
<li>Children under 12 must wear life jackets at all times while on deck.</li>
</ol>
</section>

<section>
<h2>6. LIABILITY WAIVER &amp; ASSUMPTION OF RISK</h2>
<p>I, <strong>{{signer_name}}</strong>, acknowledge that boating and water activities involve inherent risks including but not limited to drowning, injury, sunburn, seasickness, property damage, and death. I voluntarily assume all risks associated with this charter.</p>
<p>I hereby release, waive, discharge, and covenant not to sue <strong>{{company_name}}</strong>, its owners, captains, crew, officers, agents, employees, and representatives from any and all liability, claims, demands, actions, or causes of action arising out of or related to any loss, damage, injury, or death that may occur during the charter.</p>
<p>I confirm that all guests in my party have been informed of and agree to these terms. I accept full responsibility for the conduct and safety of all guests in my party, including minors.</p>
</section>

<section>
<h2>7. DAMAGE POLICY</h2>
<p>The client is responsible for any damage to the vessel, equipment, or furnishings caused by negligence, misuse, or reckless behavior by any member of their party during the charter. <strong>{{company_name}}</strong> reserves the right to charge the payment method on file for repair or replacement costs.</p>
</section>

<section>
<h2>8. AGREEMENT &amp; SIGNATURE</h2>
<p>By signing below, I, <strong>{{signer_name}}</strong>, confirm that I have read, understood, and agree to all terms and conditions of this Captained Charter Agreement for <strong>{{charter_date}}</strong>.</p>
<p>Signed on: <strong>{{today}}</strong></p>
<p>Signature: <strong>{{signer_signature}}</strong></p>
</section>`,
  },
];
