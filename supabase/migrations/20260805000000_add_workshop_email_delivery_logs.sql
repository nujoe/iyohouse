-- Keep workshop email delivery attempts separate from registration and payment state.
CREATE TABLE IF NOT EXISTS public.workshop_email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.workshop_registrations_v2(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  template_key TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
  provider_message_id TEXT,
  batch_id UUID NOT NULL,
  failure_reason TEXT,
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workshop_email_delivery_logs_batch_registration_key
    UNIQUE (batch_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_email_delivery_logs_workshop_sent_at
  ON public.workshop_email_delivery_logs (workshop_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_email_delivery_logs_registration_sent_at
  ON public.workshop_email_delivery_logs (registration_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_email_delivery_logs_status_sent_at
  ON public.workshop_email_delivery_logs (status, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_email_delivery_logs_provider_message_id
  ON public.workshop_email_delivery_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.workshop_email_delivery_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workshop_email_delivery_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.workshop_email_delivery_logs TO service_role;
