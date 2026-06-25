import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Defs, Rect, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { SPACING } from '../../../lib/constants';

export const LineChart = ({
  data,
  labels,
  color = '#0165FC',
  width = 320,
  height = 160,
}: {
  data: number[];
  labels: string[];
  color?: string;
  width?: number;
  height?: number;
}) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;
  const paddingX = 24;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = data.map((val, index) => {
    const x = paddingX + (index / (data.length - 1)) * chartWidth;
    const y = paddingY + chartHeight - ((val - min) / range) * chartHeight;
    return { x, y };
  });

  const linePath = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${points[points.length - 1].x},${height - paddingY} L ${points[0].x},${height - paddingY} Z`;
  const gradId = `line-grad-${color.replace('#', '')}`;

  return (
    <View style={{ width, height, marginVertical: SPACING.xs }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </SvgLinearGradient>
        </Defs>
        {[0, 0.5, 1].map((ratio, i) => {
          const y = paddingY + chartHeight * ratio;
          return (
            <Line
              key={i}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="#F1F5F9"
              strokeWidth={1}
            />
          );
        })}
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} stroke="#FFFFFF" strokeWidth={1} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: paddingX - 4, marginTop: 4 }}>
        {labels.map((l, i) => (
          <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }} key={i}>{l}</Text>
        ))}
      </View>
    </View>
  );
};

export const BarChart = ({
  data,
  labels,
  color = '#006D77',
  width = 320,
  height = 160,
}: {
  data: number[];
  labels: string[];
  color?: string;
  width?: number;
  height?: number;
}) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const range = max === 0 ? 1 : max;
  const paddingX = 24;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const barWidth = Math.max(8, (chartWidth / data.length) * 0.5);
  const barGap = (chartWidth / data.length) * 0.5;

  return (
    <View style={{ width, height, marginVertical: SPACING.xs }}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((ratio, i) => {
          const y = paddingY + chartHeight * ratio;
          return (
            <Line
              key={i}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="#F1F5F9"
              strokeWidth={1}
            />
          );
        })}
        {data.map((val, i) => {
          const x = paddingX + i * (barWidth + barGap) + barGap / 2;
          const barValHeight = (val / range) * chartHeight;
          const y = paddingY + chartHeight - barValHeight;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(3, barValHeight)}
              rx={barWidth / 2}
              ry={barWidth / 2}
              fill={color}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: paddingX - 4, marginTop: 4 }}>
        {labels.map((l, i) => (
          <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700', width: chartWidth / labels.length, textAlign: 'center' }} key={i} numberOfLines={1}>{l}</Text>
        ))}
      </View>
    </View>
  );
};
