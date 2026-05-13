import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { supabase } from './supabase';
import { BREAKPOINTS } from './constants';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
  };
}

/**
 * Subscribe to any Postgres change on a table and call onRefresh.
 * Uses a ref so the callback is always up-to-date without re-subscribing.
 */
export function useRealtimeSubscription(
  channelName: string,
  table: string,
  onRefresh: () => void,
  enabled = true,
) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () =>
        callbackRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelName, table, enabled]);
}
