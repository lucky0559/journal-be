import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/auth.guard';

const CONTACT = 'angelorabosa5@gmail.com';
const UPDATED = '29 October 2026';

const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Journ.al</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #081a1c; color: #f1ebdc; font: 17px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
  h1 { font: 400 2.2rem/1.15 Georgia, "Times New Roman", serif; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2.2rem 0 .4rem; color: #fad3a4; }
  p, li { color: #d2cdc2; }
  li { margin: .3rem 0; }
  a { color: #f0b871; }
  .meta { color: #8c978e; margin: 0 0 2rem; }
  strong { color: #f1ebdc; }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p class="meta">Journ.al &middot; Last updated ${UPDATED}</p>
${body}
</main>
</body>
</html>`;

const PRIVACY = page('Privacy policy', `
<p>Journ.al is a quiet journaling app for Android. This page explains what it stores, why, who else touches it, and how you can delete it. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Your Google account details</strong> when you sign in with Google: your name, first name, email address, profile photo and Google account ID. We use them to create your account and to show your name and photo to friends you choose to share with. Your email address is never shown to other people.</li>
  <li><strong>Your journal pages:</strong> the date and time, your text, the mood colour you pick, the feelings you tag, the writing prompt, stickers, and any photos and voice recordings you add.</li>
  <li><strong>Friends and reactions:</strong> friend requests, who your friends are, and the reactions people leave on shared pages. You can also add a short bio.</li>
  <li><strong>On your phone only:</strong> your settings (your name for greetings and your reminder time) and your PIN, which stays on your device and is never sent to us. If you turn on fingerprint or face unlock, your phone checks it; we never see it.</li>
</ul>
<p>We do not collect your location, contacts, advertising ID or device identifiers, and the app has no analytics, tracking or ads.</p>

<h2>Who can see your pages</h2>
<p>Every page is private (<strong>Only me</strong>) by default. A page is visible to friends or to the public only if you choose that for the page. Your mood and feelings are <strong>never</strong> shown to anyone but you, even on shared pages.</p>

<h2>Why we use it</h2>
<p>Only to run the app: to sign you in, to save your journal to your account so it follows you to any phone, and to show pages to the people you shared them with. We do not sell your data, share it for advertising, or use it to train AI models.</p>

<h2>Services that handle your data for us</h2>
<ul>
  <li><strong>Google Sign-In</strong> (sign-in).</li>
  <li><strong>Neon</strong> (database hosting for your account and pages).</li>
  <li><strong>Cloudinary</strong> (storage and delivery of photos and voice recordings).</li>
  <li><strong>Vercel</strong> (hosting of the app's server).</li>
</ul>
<p>Data travels between the app and our server over HTTPS. Photos and voice notes are delivered through signed links.</p>

<h2>Permissions the app asks for</h2>
<ul>
  <li><strong>Camera and photos:</strong> to add a picture to a page.</li>
  <li><strong>Microphone:</strong> to record a voice note.</li>
  <li><strong>Notifications:</strong> for one optional reminder a night, scheduled on your phone.</li>
  <li><strong>Biometrics:</strong> to unlock the app, if you turn this on.</li>
</ul>

<h2>Keeping and deleting your data</h2>
<p>We keep your journal until you delete it. You can delete your account at any time in the app (<strong>Me &rarr; Delete my account</strong>), which removes your account, all your pages including those marked Only me, your friendships and reactions, and your photos and voice recordings from our servers. If you cannot open the app, see <a href="/delete-account">how to request deletion</a>. Copies in our hosting providers' short-lived backups can take a little longer to expire.</p>

<h2>Children</h2>
<p>Journ.al is not meant for children under 13, and we do not knowingly collect their data. If you think a child has an account, email us and we will remove it.</p>

<h2>Changes</h2>
<p>If this policy changes in a way that matters, we will update the date at the top and tell you in the app.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
`);

const DELETE = page('Delete your Journ.al account', `
<p>You can delete your account and everything in it at any time.</p>

<h2>In the app</h2>
<ol>
  <li>Open Journ.al and go to <strong>Me</strong>.</li>
  <li>Tap <strong>Delete my account</strong> and confirm.</li>
</ol>

<h2>If you cannot open the app</h2>
<p>Email <a href="mailto:${CONTACT}?subject=Delete%20my%20Journ.al%20account">${CONTACT}</a> from the Google account you signed in with, with the subject <em>Delete my Journ.al account</em>. We will delete it and reply to confirm.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your account and profile (name, email, photo, bio).</li>
  <li>All your pages, including pages marked Only me, with their mood, feelings, text and stickers.</li>
  <li>Your photos and voice recordings.</li>
  <li>Your friendships, friend requests and reactions.</li>
</ul>
<p>Deleting is permanent and cannot be undone. Copies in our hosting providers' short-lived backups can take a little longer to expire. See the <a href="/privacy">privacy policy</a>.</p>
`);

@Controller()
export class LegalController {
  @Public()
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy() {
    return PRIVACY;
  }

  @Public()
  @Get('delete-account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  deleteAccount() {
    return DELETE;
  }
}
