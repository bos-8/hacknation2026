import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isAppLocale } from '@/schemas/i18n';
import { requireAdminAccess } from '@/server/auth/admin-access';
import { Heading } from '@/ui/basic';
import { Link } from '@/i18n/navigation';
import { Robot } from 'react-bootstrap-icons';
import { basicStyles, buttonSizes, buttonTones, cx } from '@/ui/basic/styles';
import { parseConfigQuery } from '@/schemas/system-config';
import { SettingsResults } from './settings-results';
export const instant = false;
async function Content({params,searchParams}:PageProps<'/[locale]/admin/settings'>) {
  const {locale}=await params;if(!isAppLocale(locale))notFound();await requireAdminAccess();
  const t=await getTranslations({locale,namespace:'common.admin.settings'});
  const llm = await getTranslations({ locale, namespace: 'common.admin.llm' });
  return <article className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
      <Heading level={2} className="text-xl">{t('title')}</Heading>
      <Link href="/chat/settings" locale={locale} className={cx(basicStyles.button, buttonSizes.sm, buttonTones['main-outline'])}>
        <Robot aria-hidden="true" className="size-4" />{llm('title')}
      </Link>
    </div>
    <SettingsResults locale={locale} initialQuery={parseConfigQuery(await searchParams)} />
  </article>;
}
export default function Page(props:PageProps<'/[locale]/admin/settings'>){return <Suspense fallback={null}><Content {...props}/></Suspense>;}
