import React, { useState, useCallback } from 'react';
import { RefreshControl, ScrollView } from 'react-native';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}

export function PullToRefresh({ children, onRefresh, refreshing = false }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return; // Prevent multiple simultaneous refreshes

    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing || refreshing}
          onRefresh={handleRefresh}
          tintColor="#FF4500"
          colors={['#FF4500']}
          progressBackgroundColor="#1A1A1A"
        />
      }>
      {children}
    </ScrollView>
  );
}
