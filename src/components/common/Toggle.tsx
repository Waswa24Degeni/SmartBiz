import React from 'react';
import { View, StyleSheet, Switch, Text } from 'react-native';
import { COLORS } from '../../lib/constants';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ value, onChange }: ToggleProps) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: COLORS.border, true: COLORS.accent }}
      thumbColor={COLORS.white}
      ios_backgroundColor={COLORS.border}
    />
  );
}
