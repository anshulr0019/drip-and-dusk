// Generates the static policy pages in dist/policies/. Edit the wording here, then run:
//   node scripts/policy-pages.mjs
// Business details (names, email, phone, address, delivery charges) are not written into the HTML;
// dist/policy.mjs fills them from the owner's Business & ordering settings when the page loads.
import {writeFileSync,mkdirSync} from 'node:fs';
export const UPDATED='29 October 2026';
const s=key=>`<span data-store="${key}"></span>`;
// A line that disappears entirely when the owner has not filled in that detail yet.
const line=(key,label,html=s(key))=>`<p data-store-line="${key}"><b>${label}</b> ${html}</p>`;
const contactBlock=`<div class="policy-contact">${line('legalName','Business:')}${line('supportEmail','Email:','<a data-store-href="mailto" data-store="supportEmail"></a>')}${line('supportPhone','Phone / WhatsApp:','<a data-store-href="tel" data-store="supportPhone"></a>')}${line('businessAddress','Address:')}</div>`;
export const pages={
 privacy:{title:'Privacy policy',intro:'How we collect, use and protect your personal information when you browse, sign in or order.',body:`
<h2>Who we are</h2><p>${s('storeName')} ("we", "us") runs this website and is responsible for the personal information described here. You can reach us using the details at the end of this page.</p>
<h2>What we collect</h2><ul>
<li><b>Order details:</b> your name, mobile number, delivery address and PIN code, the products you order, and the order total.</li>
<li><b>Payment details:</b> for Razorpay payments, Razorpay processes your card, UPI or bank details and tells us only the payment reference and status. We never see or store your card number, CVV or UPI PIN. For Direct UPI, we record the UPI transaction reference (UTR) you enter so that we can match your payment.</li>
<li><b>Account details:</b> if you sign in, your email address, and your name and email from Google if you choose Google sign-in. Guest checkout does not need an account.</li>
<li><b>Messages:</b> anything you send us by WhatsApp, email or Instagram, and whether you asked for WhatsApp order updates.</li>
<li><b>Technical information:</b> a short-lived, anonymous browser identifier used only to prevent abuse and limit excessive requests, a sign-in session cookie if you sign in, and standard request information such as IP address that our hosting providers process to deliver the site.</li></ul>
<p>Your bag, favourites and recently viewed fragrances are saved in your own browser's storage and are not sent to us unless you place an order.</p>
<h2>How we use it</h2><ul><li>To process, deliver and support your order, including verifying payment and sharing your private tracking link.</li><li>To let you sign in and see your orders.</li><li>To answer your questions and send updates you asked for.</li><li>To keep the site secure and prevent fraud or misuse.</li><li>To meet our legal, tax and accounting obligations.</li></ul>
<p>We do not sell your personal information, and we do not send marketing messages unless you have asked for them.</p>
<h2>Who we share it with</h2><p>Only with service providers who help us run the store, and only as needed for that purpose:</p><ul><li><b>Razorpay</b>, to process payments.</li><li><b>Courier partners</b>, who receive your name, phone number and address to deliver your order.</li><li><b>Hosting and infrastructure providers</b> (Vercel and Cloudflare), which host the website and store order records.</li><li><b>Supabase and Google</b>, if you sign in to an account.</li><li><b>WhatsApp (Meta)</b>, if you message us there.</li></ul>
<p>We may also disclose information when required by law or to protect our rights and customers.</p>
<h2>How long we keep it</h2><p>We keep order records for as long as needed to fulfil the order, handle returns and meet legal, tax and accounting requirements. Account information is kept while your account is active. Anonymous browser identifiers expire within 24 hours.</p>
<h2>Your choices and rights</h2><p>You can ask us to show, correct or delete the personal information we hold about you, or withdraw consent for WhatsApp updates, by contacting us. We may need to keep some order records where the law requires it. You can clear your bag and favourites at any time by clearing your browser's site data.</p>
<h2>Security</h2><p>The site is served only over HTTPS. Order tracking links are private and unguessable, payment confirmations are verified on our server, and owner access to orders requires an approved account. No method of transmission or storage is completely secure, but we work to protect your information.</p>
<h2>Children</h2><p>This store is intended for adults. We do not knowingly collect information from anyone under 18.</p>
<h2>Changes</h2><p>We may update this policy from time to time. The date at the top shows when it last changed.</p>
<h2>Contact and grievances</h2><p>For any privacy question or complaint, contact us below.</p>${contactBlock}${line('grievanceOfficer','Grievance officer:')}`},
 terms:{title:'Terms & conditions',intro:'The terms that apply when you use this website and buy from us.',body:`
<h2>About these terms</h2><p>This website is operated by ${s('storeName')}. By using the site or placing an order, you agree to these terms, together with our <a href="/privacy">Privacy policy</a>, <a href="/refunds">Refund & cancellation policy</a> and <a href="/shipping">Shipping & delivery policy</a>.</p>
<h2>Our products</h2><ul>
<li><b>Multi-brand retailer:</b> we sell fragrances from different brands. Brand names, logos and product photographs belong to their owners. Unless we say so, we are not an authorised dealer of, or affiliated with, those brands.</li>
<li><b>Full bottles</b> are supplied in the condition stated on the product page.</li>
<li><b>Decants</b> are a smaller amount of fragrance that we transfer from an original bottle into a separate atomiser. Product photographs show the original bottle for reference, not the decant packaging.</li>
<li><b>Fragrance notes</b> describe the scent's character, not an ingredient list. How a fragrance smells and lasts varies with skin, application and conditions. Families and occasion pairings are suggestions.</li>
<li><b>Safety:</b> perfume is flammable. Keep it away from heat, flames, eyes and children. Test on a small area of skin if you have sensitive skin or allergies.</li></ul>
<h2>Prices and availability</h2><p>Prices are shown in Indian rupees (INR). Delivery charges are shown at checkout before you pay, and there is no added payment fee. Checkout rechecks price and stock before payment. If an item becomes unavailable or was listed at an obvious pricing error, we may cancel the order and refund you in full.</p>
<p>Listings marked as community offers or enquiries are dated quotes for information only. They are not an offer to sell until we confirm price, stock and terms with you directly.</p>
<h2>Orders and payment</h2><ul>
<li>Your order is confirmed only after your payment is verified.</li>
<li><b>Razorpay:</b> the order is confirmed once Razorpay confirms a successful payment of the full amount.</li>
<li><b>Direct UPI:</b> pay the exact order total to the UPI ID shown at checkout and enter your UPI transaction reference (UTR). We confirm the order once we have matched the payment. Stock is held for 30 minutes; orders not paid in that time are released.</li>
<li>If a payment reaches us after an order has been released, we will contact you to fulfil the order if stock allows, or refund the payment in full.</li></ul>
<h2>Accounts</h2><p>You can check out as a guest or sign in. If you sign in, keep access to your email or Google account secure. Your private order tracking link lets anyone who has it see the order status, so share it with care.</p>
<h2>Liability</h2><p>To the extent permitted by law, our total liability for any order is limited to the amount you paid for it. Nothing in these terms limits your rights under applicable consumer protection law.</p>
<h2>Governing law</h2><p>These terms are governed by the laws of India. Disputes are subject to the jurisdiction of the courts where our business is located.</p>
<h2>Contact</h2>${contactBlock}`},
 refunds:{title:'Refund & cancellation policy',intro:'When you can cancel or return an order, and how refunds work.',body:`
<h2>Cancelling an order</h2><ul><li><b>Before dispatch:</b> contact us with your order reference and we will cancel the order and refund you in full.</li><li><b>After dispatch:</b> the order can no longer be cancelled. If you refuse the delivery, the refund is made after the parcel returns to us, less the original delivery charge.</li><li><b>Unpaid orders</b> are released automatically after the payment window; nothing is charged.</li></ul>
<h2>Returns</h2><p>Because fragrances are personal-care products, we cannot accept returns for change of mind or for how a fragrance smells on you.</p><ul><li><b>Decants</b> are filled to order and cannot be returned.</li><li><b>Damaged, leaking or wrong items:</b> tell us within <b>48 hours of delivery</b> with your order reference and clear photos or an unboxing video showing the problem. Once we confirm the issue, we will send a replacement or refund you in full, including delivery.</li><li>Please do not send items back before we have confirmed the return; we will tell you how.</li></ul>
<h2>Refunds</h2><ul><li><b>Razorpay payments</b> are refunded to the original payment method. Banks usually take 5–7 working days to show the refund.</li><li><b>Direct UPI payments</b> are refunded to the UPI ID or bank account the payment came from.</li><li>We start an approved refund within 2 working days, and we will share the refund reference with you.</li></ul>
<h2>Contact</h2><p>To cancel an order or report a problem, contact us with your order reference (it begins with <b>DD-</b>).</p>${contactBlock}`},
 shipping:{title:'Shipping & delivery policy',intro:'Where we deliver, what it costs and when to expect your order.',body:`
<h2>Where we deliver</h2><p>We deliver to addresses across India that our courier partners can serve. If we cannot deliver to your PIN code, we will contact you and refund the order in full.</p>
<h2>Delivery charges</h2><p data-store-delivery>Delivery is charged at a flat rate shown at checkout before you pay.</p>
<h2>Dispatch and delivery times</h2><ul><li>Orders are usually dispatched within <b>1–3 working days</b> after payment is confirmed.</li><li>Delivery typically takes <b>3–7 working days</b> after dispatch, depending on your location.</li><li>Perfume is a flammable item, so couriers may send it by road rather than air, which can add time for remote areas. Courier delays outside our control can happen; we will help you follow up.</li></ul>
<h2>Tracking</h2><p>Every order has a private tracking page. Once your order ships, the courier name, AWB number and tracking link appear there.</p>
<h2>Receiving your parcel</h2><p>Please check the parcel when it arrives. If it is damaged, leaking or not what you ordered, tell us within 48 hours of delivery with photos or an unboxing video. See our <a href="/refunds">Refund & cancellation policy</a>.</p>
<h2>Contact</h2>${contactBlock}`},
 contact:{title:'Contact us',intro:'Questions about a fragrance, an order or a delivery? We are happy to help.',body:`
<h2>Get in touch</h2>${contactBlock}${line('instagramUrl','Instagram:','<a data-store-href="url" data-store="instagramUrl" target="_blank" rel="noopener noreferrer"></a>')}
<p data-store-missing class="notice">Contact details are being updated. Please message us on Instagram or WhatsApp from the shop.</p>
<h2>About an order</h2><p>Include your order reference (it begins with <b>DD-</b>) so we can find it quickly. You can also check the status any time from your private tracking link.</p>
<h2>Grievances</h2><p>If you are not satisfied with how we handled a question or complaint, contact our grievance officer at the details above.</p>${line('grievanceOfficer','Grievance officer:')}`}
};
const nav=[['privacy','Privacy'],['terms','Terms'],['refunds','Refunds & cancellation'],['shipping','Shipping & delivery'],['contact','Contact']];
export function render(id){
 const page=pages[id];
 return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="theme-color" content="#25231f">
<meta name="description" content="${page.intro}">
<title>${page.title} — Drip & Dusk</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><script type="module" src="/policy.mjs"></script>
</head>
<body class="policy-body">
<header class="header policy-header"><a class="wordmark" href="/" aria-label="Drip and Dusk home">DRIP <i>&</i> DUSK<span>THE FRAGRANCE EDIT</span></a><a class="text-link" href="/#collection">Back to the shop <svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#arrow-up-right-icon"></use></svg></a></header>
<main class="policy-page">
<nav class="policy-nav" aria-label="Store policies">${nav.map(([key,label])=>`<a href="/${key}"${key===id?' aria-current="page"':''}>${label}</a>`).join('')}</nav>
<article class="policy-article"><p class="eyebrow">DRIP & DUSK / CUSTOMER CARE</p><h1>${page.title}</h1><p class="policy-intro">${page.intro}</p><p class="policy-updated">Last updated ${UPDATED}</p>${page.body.trim()}</article>
</main>
<footer class="policy-footer"><span>© <span data-year></span> ${s('storeName')}</span><span>${nav.map(([key,label])=>`<a href="/${key}">${label}</a>`).join(' · ')}</span></footer>
<svg class="svg-defs" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><symbol id="arrow-up-right-icon" viewBox="0 0 24 24"><path d="M6 18 18 6M6 6h12v12"/></symbol></defs></svg>
</body></html>
`;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const dir=new URL('../dist/policies/',import.meta.url);mkdirSync(dir,{recursive:true});
 for(const id of Object.keys(pages))writeFileSync(new URL(id+'.html',dir),render(id));
 console.log(Object.keys(pages).length+' policy pages written');
}
