# Contact Form Fix — Apply Instructions

## Files Changed

```
supabase/functions/send-contact-email/index.ts   (new file)
src/components/ContactSection.tsx                 (modified)
```

## How to Apply

Copy both files into your `persona-pinnacle` repo at the same paths, then:

### 1. Deploy the Edge Function

```bash
supabase functions deploy send-contact-email --project-ref mugectvlobgzyonzcmme
```

### 2. Add Your Resend API Key as a Secret

In the [Supabase Dashboard](https://supabase.com/dashboard/project/mugectvlobgzyonzcmme/settings/functions) under **Edge Functions → Secrets**, add:

```
RESEND_API_KEY = <your key from resend.com>
```

Or via CLI:
```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key --project-ref mugectvlobgzyonzcmme
```

### 3. Resend Setup

1. Sign up at https://resend.com (free — 100 emails/day)
2. Go to **API Keys** and create a new key
3. During free tier, you can only send from `onboarding@resend.dev` — this is already configured in the edge function
4. Once you add a verified domain, update the `from` field in the edge function to use your own domain

## How It Works

- Form submits → calls `supabase.functions.invoke('send-contact-email')`
- Edge function receives `{ name, email, message }`
- Calls Resend API → sends email to `gouravkhanijoe@gmail.com`
- `reply_to` is set to the sender's email so you can reply directly
- UI shows "Sending..." while in flight, success/error message after
