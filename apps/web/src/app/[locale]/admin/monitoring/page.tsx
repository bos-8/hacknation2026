export const instant = false;

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isAppLocale } from '@/schemas/i18n';
import { requireAdminAccess } from '@/server/auth/admin-access';
import { Heading, Text } from '@/ui/basic';
import { ServiceMonitoring } from '../service-monitoring';

async function MonitoringContent({ params }: PageProps<'/[locale]/admin/monitoring'>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const t = await getTranslations({ locale, namespace: 'common.admin.monitoring' });
  return <article className="min-w-0">
    <Heading level={2} className="text-xl">{t('title')}</Heading>
    <Text className="mt-2 text-muted-foreground">{t('pageDescription')}</Text>
    <ServiceMonitoring locale={locale} />
  </article>;
}

export default function MonitoringPage(props: PageProps<'/[locale]/admin/monitoring'>) {
  return <Suspense fallback={null}><MonitoringContent {...props} /></Suspense>;
}
