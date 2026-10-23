-- ELAINA CLOUD: flexible DNS records (A, AAAA, CNAME, TXT)
-- Run in Supabase SQL Editor before deploying the updated app.
ALTER TABLE public.domain_requests ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS dns_type text NOT NULL DEFAULT 'A';
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS dns_name text NOT NULL DEFAULT '@';
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS dns_value text;
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS dns_ttl integer NOT NULL DEFAULT 1;
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS dns_proxied boolean NOT NULL DEFAULT false;
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS target_provider text NOT NULL DEFAULT 'vps';
ALTER TABLE public.domain_requests ADD COLUMN IF NOT EXISTS provider_notes text;
UPDATE public.domain_requests SET dns_value = host(ip_address) WHERE dns_value IS NULL AND ip_address IS NOT NULL;
UPDATE public.domain_requests SET dns_type = 'A' WHERE dns_type IS NULL OR dns_type NOT IN ('A','AAAA','CNAME','TXT');
ALTER TABLE public.domain_requests DROP CONSTRAINT IF EXISTS domain_requests_dns_type_check;
ALTER TABLE public.domain_requests ADD CONSTRAINT domain_requests_dns_type_check CHECK (dns_type IN ('A','AAAA','CNAME','TXT'));
ALTER TABLE public.domain_requests DROP CONSTRAINT IF EXISTS domain_requests_dns_ttl_check;
ALTER TABLE public.domain_requests ADD CONSTRAINT domain_requests_dns_ttl_check CHECK (dns_ttl IN (1,60,120,300,600,900,1800,3600,7200,18000,43200,86400));
