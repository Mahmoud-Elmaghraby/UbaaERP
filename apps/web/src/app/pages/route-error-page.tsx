import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@erp-platform/ui';
import { AlertTriangle, FileQuestion } from 'lucide-react';

/**
 * Rendered by react-router instead of a crashed page (errorElement). Lives inside the
 * app shell, so the sidebar/top bar stay usable and the user can simply navigate away
 * — instead of the raw English stack trace react-router shows by default.
 */
export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  const details =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold">{t('errorPage.title')}</h1>
      <p className="text-muted-foreground">{t('errorPage.description')}</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('errorPage.retry')}</Button>
        <Button variant="outline" asChild>
          <Link to="/">{t('errorPage.goHome')}</Link>
        </Button>
      </div>
      {import.meta.env.DEV ? (
        <details className="mt-4 w-full rounded-lg border bg-subtle p-3 text-start text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            {t('errorPage.details')}
          </summary>
          <pre
            dir="ltr"
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-left text-muted-foreground"
          >
            {details}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold">{t('errorPage.notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('errorPage.notFoundDescription')}</p>
      <Button asChild>
        <Link to="/">{t('errorPage.goHome')}</Link>
      </Button>
    </div>
  );
}
