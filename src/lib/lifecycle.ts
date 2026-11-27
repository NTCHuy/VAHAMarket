import { supabase } from '@/lib/supabase';
import type { Listing, SavedSearch } from '@/types';

const BUMP_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

export function getDaysUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function getBumpCooldownInfo(bumpedAt: string | null | undefined): {
  canBump: boolean;
  hoursLeft: number;
  daysLeft: number;
} {
  if (!bumpedAt) return { canBump: true, hoursLeft: 0, daysLeft: 0 };
  const nextAt = new Date(bumpedAt).getTime() + BUMP_COOLDOWN_MS;
  const diffMs = nextAt - Date.now();
  if (diffMs <= 0) return { canBump: true, hoursLeft: 0, daysLeft: 0 };
  const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000));
  const daysLeft = Math.floor(hoursLeft / 24);
  return { canBump: false, hoursLeft, daysLeft };
}

export async function bumpListing(listingId: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('bump_listing', {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  return data as Listing;
}

export async function renewExpiredListing(listingId: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('renew_expired_listing', {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  return data as Listing;
}

export async function listMySavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await supabase.rpc('list_my_saved_searches');
  if (error) throw new Error(error.message);
  return (data as SavedSearch[] | null) ?? [];
}

export async function createSavedSearch(input: {
  keyword: string;
  category?: string;
  province?: string;
  maxPrice?: number | null;
}): Promise<SavedSearch> {
  const { data, error } = await supabase.rpc('create_saved_search', {
    p_keyword: input.keyword.trim(),
    p_category: input.category?.trim() || null,
    p_province: input.province?.trim() || null,
    p_max_price: input.maxPrice && input.maxPrice > 0 ? input.maxPrice : null,
  });
  if (error) throw new Error(error.message);
  return data as SavedSearch;
}

export async function toggleSavedSearch(id: string, active: boolean): Promise<SavedSearch> {
  const { data, error } = await supabase.rpc('toggle_saved_search', {
    p_id: id,
    p_active: active,
  });
  if (error) throw new Error(error.message);
  return data as SavedSearch;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_saved_search', { p_id: id });
  if (error) throw new Error(error.message);
}
