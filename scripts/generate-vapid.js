// Run with: npm run generate:vapid
// Prints a fresh VAPID key pair — paste the values into .env.local (public key)
// and Convex's environment variables (both keys). Only needs to be run once ever.
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('\nAdd this to .env.local:');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('\nAdd these to Convex (npx convex env set NAME value), not .env.local:');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   (use a real contact — required by the push spec)\n');
