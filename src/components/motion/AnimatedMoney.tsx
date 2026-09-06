import React from 'react';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { CurrencyCode } from '../../types';
import { useCountAnimation } from '../../hooks/useCountAnimation';

export const AnimatedMoney: React.FC<{
  minor: number;
  currency: CurrencyCode;
  className?: string;
  duration?: number;
}> = ({ minor, currency, className, duration }) => {
  const animated = useCountAnimation(minor, { duration });
  return <span className={className}>{MoneyValue.fromMinorUnits(animated, currency).format()}</span>;
};

export const AnimatedMoneyInline: React.FC<{
  minor: number;
  currency: CurrencyCode;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ minor, currency, prefix, suffix, className }) => {
  const animated = useCountAnimation(minor);
  return (
    <span className={className}>
      {prefix}
      {MoneyValue.fromMinorUnits(animated, currency).format()}
      {suffix}
    </span>
  );
};
