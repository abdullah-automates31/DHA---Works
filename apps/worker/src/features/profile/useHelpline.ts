import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * The DHA helpline number, or null while DHA has not approved showing it (app_settings.helpline_enabled is
 * false and the number empty by default, docs/DECISIONS.md). The settings are readable by signed-in users.
 */
export function useHelpline(): string | null {
  const [number, setNumber] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['helpline_enabled', 'helpline_number'])
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const enabled = data.find((r) => r.key === 'helpline_enabled')?.value === true;
        const value = data.find((r) => r.key === 'helpline_number')?.value;
        setNumber(enabled && typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
      });
    return () => {
      active = false;
    };
  }, []);
  return number;
}
