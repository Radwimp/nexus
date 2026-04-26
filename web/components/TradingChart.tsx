'use client';

import { useRef, useEffect } from 'react';
import { useExchangeStore } from '@/lib/store';

export default function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const { recentTrades, selectedPair } = useExchangeStore();

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: any;
    let series: any;

    import('lightweight-charts').then(({ createChart, ColorType }) => {
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#0b0e11' },
          textColor: '#848e9c',
          fontFamily: "'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: '#1e2329' },
          horzLines: { color: '#1e2329' },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: '#363c46', width: 1, style: 2 },
          horzLine: { color: '#363c46', width: 1, style: 2 },
        },
        rightPriceScale: {
          borderColor: '#2b3139',
        },
        timeScale: {
          borderColor: '#2b3139',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      series = chart.addAreaSeries({
        topColor: 'rgba(14, 203, 129, 0.3)',
        bottomColor: 'rgba(14, 203, 129, 0.02)',
        lineColor: '#0ecb81',
        lineWidth: 2,
      });

      chartRef.current = chart;
      seriesRef.current = series;

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && chart) {
          chart.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        chart.remove();
      };
    });

    return () => {
      if (chart) chart.remove();
    };
  }, [selectedPair]);

  // Update chart with new trades
  useEffect(() => {
    if (!seriesRef.current || recentTrades.length === 0) return;

    // Build time series from trades (aggregate by second)
    const tradesByTime = new Map<number, { time: number; value: number }>();

    for (const trade of [...recentTrades].reverse()) {
      const ts = Math.floor(new Date(trade.timestamp).getTime() / 1000);
      tradesByTime.set(ts, { time: ts, value: parseFloat(trade.price) });
    }

    const data = Array.from(tradesByTime.values()).sort((a, b) => a.time - b.time);

    if (data.length > 0) {
      seriesRef.current.setData(data);
    }
  }, [recentTrades]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{selectedPair} Chart</h3>
      </div>
      <div className="chart-container" ref={containerRef} />
    </div>
  );
}
