# Email notifications

UNRET emails people about new requests, offers, messages, payments and other updates.

- **Who gets what:** each person chooses in **Settings → Notifications**:
  - a master **Email notifications** on/off switch,
  - per-type choices (the Email column).
- **Unsubscribe:** every email has a **Turn off email notifications** link that works without signing in. Gmail and Outlook also show their own "Unsubscribe" button (one-click unsubscribe).
- **No inbox flooding:** several chat messages in a row send one email, not one per message.
- **Language:** emails use the person's language (Romanian or English).

## Try it locally (no account needed)

With Docker, all emails go to **Mailpit**, a local inbox. Open http://localhost:8025 to read them.

To send one right away, sign in, open **Settings → Notifications** and tap **Send me a test email**.

## Connect a real email service

UNRET sends email over **SMTP**, which works with almost every email provider. Create a file named `.env` next to `docker-compose.yml`:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-login
SMTP_PASS=your-smtp-key
EMAIL_FROM=UNRET <notificari@your-domain.ro>
PUBLIC_WEB_URL=https://your-domain.ro
```

Then restart: `docker compose up -d`.

| Provider | SMTP_HOST | Port | Free tier |
|---|---|---|---|
| Brevo (ex-Sendinblue) | smtp-relay.brevo.com | 587 | 300 emails/day |
| SendGrid | smtp.sendgrid.net (user: `apikey`) | 587 | 100 emails/day |
| Postmark | smtp.postmarkapp.com | 587 | 100 emails/month |
| Amazon SES | email-smtp.eu-central-1.amazonaws.com | 587 | very cheap at scale |
| Gmail / Google Workspace | smtp.gmail.com (needs an "app password") | 465 | testing only |

### Get emails delivered, not marked as spam

- Send from your own domain, e.g. `notificari@unret.ro`.
- In your provider, verify that domain. It gives you DNS records (SPF, DKIM, DMARC) to add at your domain registrar.
- Keep the secret SMTP password only in `.env`. Never commit it or share it.
