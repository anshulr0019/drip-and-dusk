// One source of truth for browser security headers. vercel.json and dist/_headers repeat these values; tests fail if the copies drift.
// Checked against the shipped pages: scripts are all same-origin modules, styles come from style.css plus inline style attributes and Google Fonts, images are same-origin or data: URLs (owner photo previews). Re-enabling Razorpay needs script-src https://checkout.razorpay.com, frame-src https://api.razorpay.com and connect-src https://lumberjack.razorpay.com added here.
export const securityHeaders={
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
};
