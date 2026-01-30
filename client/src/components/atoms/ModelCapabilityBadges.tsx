import { useTranslation } from 'react-i18next';

const CAPABILITIES = ['tools', 'vision', 'thinking'] as const;

const CAPABILITY_STYLES: Record<(typeof CAPABILITIES)[number], string> = {
  tools: 'rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary',
  vision: 'rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400',
  thinking: 'rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400',
};

interface Props {
  capabilities?: string[];
  className?: string;
}

export function ModelCapabilityBadges({ capabilities, className = '' }: Props) {
  const { t } = useTranslation();

  if (!capabilities?.length) {
    return null;
  }

  const badges = CAPABILITIES.filter((cap) => capabilities.includes(cap)).map((cap) => ({
    cap,
    label: t(`ModelCapabilityBadges.${cap}`),
    className: CAPABILITY_STYLES[cap],
  }));

  if (badges.length === 0) {
    return null;
  }

  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map(({ cap, label, className: badgeClass }) => (
        <span key={cap} className={badgeClass}>
          {label}
        </span>
      ))}
    </span>
  );
}
