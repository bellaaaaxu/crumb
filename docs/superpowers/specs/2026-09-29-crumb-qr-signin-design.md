# Crumb: QR Code Sign-In and "Add to Home Screen"

*Translated from the Chinese original, [2026-09-29-crumb-qr-signin-design.zh-CN.md](2026-09-29-crumb-qr-signin-design.zh-CN.md).*

Status: approved (2026-09-29), and implemented (see the status line of the plan and `docs/VALIDATION.md`).
Prerequisite: team members have already switched to personal sign-in links with no password (decided the same day; see `docs/VALIDATION.md`).

## 1. Goals and Confirmed Decisions

When an admin gives a team member a sign-in link, the QR code now comes first: the employee signs in by scanning it in person with their phone camera.

Decisions:

- The QR code comes first, while the link and "Copy link" are kept for employees who are not present.
- After an employee's first sign-in, prompt them to add Crumb to their phone's home screen and open it from the icon from then on.
- Two open-source libraries may be added: `uqr` (MIT, generates the QR code, runtime dependency) and `jsqr` (Apache-2.0, only used in tests to scan the QR code back and check it).
- Team member sign-in stays at a fixed 180 days; it does not change to "never expires as long as it is in use".

Success criteria: after an admin creates a team member, the QR code on screen, scanned with a phone camera, opens the matching sign-in page;
after the QR code image is sent to the employee, the employee can also long-press it on their phone to recognize and open it; the scanned content matches the link character for character;
after signing in, the employee can put Crumb on their home screen, and tapping the icon keeps them signed in.

## 2. The Admin Side

- All one-time links share one panel: team member sign-in links, admin invitations and password resets.
  The QR code appears at the very top of the panel (about 240×240 pixels); below it, as before, are the link, "Copy link", the existing instructions and "Done".
- The QR code can be used in two ways (added on 2026-09-29: the QR code can be sent straight to the employee, who long-presses the image on their own phone to recognize and open it):
  - In person: the employee scans the code on the admin's screen with their phone camera.
  - Not present: send the QR code image to the employee (WeChat, WhatsApp, etc.), and the employee long-presses the image on their phone to recognize it.
  The panel instructions cover both: "In person, ask {name} to scan with their phone camera; if they are not present, send them the QR code and they long-press the image on their phone to recognize it".
- The QR code is an ordinary PNG image that can be saved, copied and sent in chat apps; its alt text says whose sign-in it is.
- Below the QR code there is always "Save QR code", which saves it as `crumb-{用户名}.png` to drag into a chat window; on devices that can call the system share feature
  (phones, and some computers) there is also "Share QR code", which opens the share menu directly to choose a chat app; if sharing fails, it saves instead.
  Right-clicking or long-pressing the image to save it also works. (Revised after the seventh review round: originally only one button was shown, based on "can share = phone", but on Windows
  Edge and Chrome can also share files, so on computers only the system share menu was left.)
- Sending the QR code is the same as sending the link: whoever uses it first is the one signed in, so send it privately.
- If generation fails (which does not happen in practice; see §5), only the link is shown and everything else stays as before.

## 3. The Employee Side

**QR code sign-in**: the camera still opens the existing sign-in page (it shows whose link this is → tap "Sign in on this device"); the flow is unchanged.

**WeChat**: when the QR code is sent in WeChat and the employee long-presses it to recognize it, the page opens in WeChat's built-in browser, so this notice matters.
When the sign-in page detects it was opened in WeChat (the browser user agent contains `MicroMessenger`), it shows a notice above the button:
"You opened this in WeChat. Tap ··· in the top-right corner, choose 'Open in Browser', then sign in, so that you can open it from the home-screen icon later."
It only informs and does not block; the employee can still sign in inside WeChat.
In WeChat, the sign-in link stays in the address bar until it is used or the page is left: WeChat's "Open in Browser" hands over the current address,
and if the link had been erased, the browser would open the password sign-in page, which team members cannot use. Other browsers still erase it as soon as it is read.

**Add to Home Screen card**:

- Shown only to team members; admins and owners sign in with a password, so it is not shown to them.
- Appears at the top of "My Crumb" until "Got it" is tapped on this device. Not shown when opened as a home-screen web app.
- Content: one sentence on the advantage (from now on, tap the icon to open it, with no need to scan again), and one line of steps each for iPhone and Android;
  the iPhone line says "If you see 'Open as Web App', turn it off".
- "Got it" is stored in this browser's local storage as an interface preference; if reading or writing fails, the card is shown as usual.

**Home-screen icon**:

- Add a web app manifest (`manifest.webmanifest`): name Crumb, start page `/`, `display` set to `browser`,
  so the icon opens in the browser and shares the browser's sign-in.
- The icons are pixel-art pastry PNGs: 180 (iPhone), 192, 512; they are generated by a script from `assets/sprites.js` and then committed,
  the same way as the share card `og.png`, so there is still no build step.

**Opened as a separate web app and not signed in**: newer iOS versions may open the home-screen icon as a separate web app,
which does not share sign-in with Safari. In this mode on iPhone (`navigator.standalone`; app windows on computers share sign-in with the browser, so it is not shown there), the sign-in page
adds a note: delete this icon, do "Add to Home Screen" again in the browser,
turn off "Open as Web App" if you see it, then open Crumb from the new icon.

## 4. API Changes

The link-generating endpoints return `qr` in addition to their existing fields: a data URL of the QR code PNG image (`data:image/png;base64,…`), or `null` if generation fails.

- `POST /api/admin/invitations` → `{ user, signinUrl | invitationUrl, qr }`
- `POST /api/admin/members/:id/signin-link` → `{ user, signinUrl, qr }`
- `POST /api/admin/members/:id/invitation` → `{ invitationUrl, qr }`
- `POST /api/admin/members/:id/reset` → `{ resetUrl, qr }`

The page puts it straight into an `<img>` (the Content Security Policy already allows `data:` images), without using `innerHTML`.
Saving and sharing use the same PNG: the page decodes the base64 into a file without going over the network. Links and tokens are not sent to any external service.

## 5. Components and Error Handling

- `server/qr.mjs`: `qrPng(text)` uses `uqr` to compute the QR code's black and white modules, then uses `sharp` (an existing dependency) to draw them as a PNG,
  with error correction level M and a four-module white border, and returns a data URL; on error it returns `null`.
  URLs are usually under 300 bytes, well within QR code capacity (about 2,300 bytes at level M).
- Interface: `linkPanel` gets an optional QR code parameter and file name; the sign-in page gets the WeChat notice and the separate web app note;
  the team member page gets the Add to Home Screen card.
- Text: new strings are added in both Chinese and English at the same time.

## 6. Tests

- Server: for all three kinds of link, `qr` is converted to pixels with `sharp` and then scanned back with `jsqr`;
  the result must be exactly the same as the returned link; the same applies to very long URLs; beyond capacity, `null` is returned.
- Browser: the panel shows the QR code and it scans back to the link; the file downloaded by "Save QR code" is a PNG that scans back to the link;
  on devices that can share there is also "Share QR code", which hands the system the same PNG and saves it instead if sharing fails;
  the card is shown only to team members, and after "Got it" is tapped it does not appear again after a refresh;
  the WeChat user agent makes the notice appear; simulating a separate web app while not signed in makes the note appear;
  the manifest and icons can be downloaded with the correct types, and the home page references them.
- For every new rule, a failing test is written first, and the code is deliberately broken to confirm the test catches it.

## 7. Not Verified and Not Doing

- **Not verified on a real phone**: whether iPhone's "Add to Home Screen" shares sign-in with Safari needs one try on a real iPhone;
  there is no real Android device, so it is recorded as unverified.
- Not doing: an in-app QR code scanner (camera), offline use, push notifications, per-organization custom home-screen names and icons.
