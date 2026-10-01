import { CheckIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';

import { useResultCoverage } from './use-horoscope-results';
import { ZODIAC_IDS, HOROSCOPE_LOCALES } from './constants';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Coverage indicator (spec §(b)) — "did we finish tomorrow?"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * THE highest-value element on the results page. For the selected date + mode it
 * shows which `(sign × language)` combinations EXIST and which are MISSING — a
 * flat list of rows cannot answer that, because the failure mode is a MISSING
 * row, not a wrong one. Derived client-side from a filtered list query (TAM-100
 * exposes no coverage endpoint; 12×N cells is trivial).
 */
export function CoverageIndicator({ dateIst, modeId }: { dateIst: string; modeId: string }) {
  const { data, isLoading, isError, error } = useResultCoverage({ dateIst, modeId });

  if (modeId === '') {
    return (
      <Alert>
        <AlertTitle>Pick a mode to see coverage</AlertTitle>
        <AlertDescription>
          Coverage is per date and mode — choose a mode above.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load coverage</AlertTitle>
        <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
      </Alert>
    );
  }

  const present = new Set((data?.items ?? []).map((r) => `${r.zodiacId}:${r.languageCode}`));
  const totalCells = ZODIAC_IDS.length * HOROSCOPE_LOCALES.length;
  const authored = present.size;
  const missing = totalCells - authored;

  return (
    <section className="grid gap-3" aria-labelledby="coverage-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="coverage-heading" className="text-sm font-semibold">
          Coverage — {dateIst}
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className={missing === 0 ? 'font-medium text-foreground' : ''}>
            {authored} of {totalCells} authored
          </span>
          {missing > 0 && <span> · {missing} missing</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs">
          <caption className="sr-only">
            Which sign and language combinations have an authored horoscope for {dateIst}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="p-1 text-left font-medium text-muted-foreground">
                Sign
              </th>
              {HOROSCOPE_LOCALES.map((locale) => (
                <th key={locale.value} scope="col" className="p-1 font-medium text-muted-foreground">
                  {locale.value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ZODIAC_IDS.map((sign) => (
              <tr key={sign.value} className="border-t">
                <th scope="row" className="p-1 text-left font-normal">
                  {sign.label}
                </th>
                {HOROSCOPE_LOCALES.map((locale) => {
                  const has = present.has(`${sign.value}:${locale.value}`);
                  return (
                    <td key={locale.value} className="p-1">
                      {has ? (
                        <span title={`${sign.label} · ${locale.value}: authored`}>
                          <CheckIcon aria-hidden="true" className="mx-auto size-4 text-primary" />
                          <span className="sr-only">authored</span>
                        </span>
                      ) : (
                        <span
                          title={`${sign.label} · ${locale.value}: missing`}
                          className="mx-auto block size-2 rounded-full bg-muted-foreground/30"
                        >
                          <span className="sr-only">missing</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
