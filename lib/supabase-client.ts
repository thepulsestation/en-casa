'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let browserClient: SupabaseClient | null = null;

export function getAuthRedirectUrl(): string {
  const normalizedBasePath = configuredBasePath
    ? `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`
    : '';

  if (typeof window === 'undefined') return `${normalizedBasePath}/`;
  return `${window.location.origin}${normalizedBasePath}/`;
}

export function clearAuthCallbackUrl(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, getAuthRedirectUrl());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}
