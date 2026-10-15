import { useEffect } from 'react';

/**
 * useRestaurantSync
 * Listens to the 'restaurant_sync' BroadcastChannel.
 * Triggers the provided callback whenever another tab performs a database mutation (e.g. order status update).
 */
export function useRestaurantSync(onSync: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    
    const channel = new BroadcastChannel('restaurant_sync');
    channel.onmessage = (event) => {
      if (event.data === 'update') {
        onSync();
      }
    };
    
    return () => {
      channel.close();
    };
  }, [onSync]);
}
