import * as React from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { useHoroscopeResults, type HoroscopeResult } from './use-horoscope-results';
import { useAllHoroscopeModes } from './use-horoscope-modes';
import { ResultFormDialog, type ResultFormState } from './result-form';
import { DeleteResultDialog } from './delete-result-dialog';
import { CoverageIndicator } from './coverage-indicator';
import { ZODIAC_IDS, HOROSCOPE_LOCALES, istToday, istTomorrow, zodiacLabel } from './constants';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Daily results — THE primary surface and the Horoscope group's landing page.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The editor's daily question is "what still needs authoring for tomorrow?", so:
 *  - the list DEFAULTS to today→tomorrow (a `dateFrom`/`dateTo` filter);
 *  - the COVERAGE indicator (which sign × language combinations exist vs are
 *    missing for a date + mode) sits above the table — a flat list of rows can't
 *    show a MISSING row, which is the actual failure mode here;
 *  - filters (date range, sign, mode, language) are load-bearing, not cosmetic;
 *  - sort offers only TAM-100's allowlist.
 *
 * Results genuinely HARD-DELETE (TAM-100's one justified exception); the row
 * action is "Delete", not "Deactivate".
 */
export function ResultsPage() {
  const table = useDataTableState({
    sort: 'dateIst',
    order: 'asc',
    filters: { dateFrom: istToday(), dateTo: istTomorrow() },
  });
  const { data, isLoading, isFetching, isError, error, refetch } = useHoroscopeResults(table.state);
  const modes = useAllHoroscopeModes();

  const [formState, setFormState] = React.useState<ResultFormState>(null);
  const [deleting, setDeleting] = React.useState<HoroscopeResult | null>(null);

  const modeItems = modes.data?.items ?? [];
  const modeOptions = modeItems.map((m) => ({ label: `${m.modeName} (${m.modeId})`, value: m.modeId }));

  // Coverage controls — default to tomorrow + the first mode. The mode default
  // is DERIVED (no effect): an empty choice falls back to the first loaded mode.
  const [coverageDate, setCoverageDate] = React.useState(istTomorrow());
  const [coverageModeChoice, setCoverageModeChoice] = React.useState('');
  const coverageMode = coverageModeChoice !== '' ? coverageModeChoice : (modeItems[0]?.modeId ?? '');

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily results</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The authored horoscope for each sign, date and language. CMS rows are the Phase-1
          product — what you author here is what the app serves on that date. The view defaults to
          today and tomorrow.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <label htmlFor="coverage-date" className="text-xs font-medium text-muted-foreground">
              Coverage date (IST)
            </label>
            <Input
              id="coverage-date"
              type="date"
              className="w-44"
              value={coverageDate}
              onChange={(event) => setCoverageDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="coverage-mode" className="text-xs font-medium text-muted-foreground">
              Coverage mode
            </label>
            <Select
              id="coverage-mode"
              className="w-56"
              value={coverageMode}
              onChange={(event) => setCoverageModeChoice(event.target.value)}
            >
              <option value="">Select a mode…</option>
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <CoverageIndicator dateIst={coverageDate} modeId={coverageMode} />
      </div>

      <DataTable<HoroscopeResult>
        caption="Daily horoscope results"
        columns={[
          { id: 'dateIst', header: 'Date (IST)', sortField: 'dateIst', cell: (r) => r.dateIst },
          {
            id: 'zodiacId',
            header: 'Sign',
            sortField: 'zodiacId',
            cell: (r) => zodiacLabel(r.zodiacId),
          },
          {
            id: 'modeId',
            header: 'Mode',
            sortField: 'modeId',
            cell: (r) => <code className="text-xs">{r.modeId}</code>,
          },
          {
            id: 'languageCode',
            header: 'Lang',
            sortField: 'languageCode',
            cell: (r) => r.languageCode,
          },
          { id: 'steps', header: 'Steps', cell: (r) => <StepsSummary result={r} /> },
          { id: 'providerName', header: 'Provider', cell: (r) => r.providerName },
          {
            id: 'contentSafetyStatus',
            header: 'Safety',
            cell: (r) => (
              <Badge variant={r.contentSafetyStatus === 'passed' ? 'default' : 'muted'}>
                {r.contentSafetyStatus || '—'}
              </Badge>
            ),
          },
          {
            id: 'generatedAt',
            header: 'Generated',
            sortField: 'generatedAt',
            cell: (r) => (
              <time dateTime={r.generatedAt} className="text-xs text-muted-foreground">
                {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'dateFrom', label: 'From (YYYY-MM-DD)', type: 'text', placeholder: istToday() },
          { id: 'dateTo', label: 'To (YYYY-MM-DD)', type: 'text', placeholder: istTomorrow() },
          {
            id: 'zodiacId',
            label: 'Sign',
            type: 'select',
            options: ZODIAC_IDS.map((z) => ({ label: z.label, value: z.value })),
          },
          { id: 'modeId', label: 'Mode', type: 'select', options: modeOptions },
          {
            id: 'languageCode',
            label: 'Language',
            type: 'select',
            options: HOROSCOPE_LOCALES.map((l) => ({ label: l.label, value: l.value })),
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New result
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(r) => r.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No results for these filters — nothing authored yet for this range."
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setFormState({ kind: 'edit', id: r.id })}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      />

      <ResultFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeleteResultDialog result={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function StepsSummary({ result }: { result: HoroscopeResult }) {
  const count = result.steps.length;
  const first = result.steps[0];
  return (
    <span className="text-xs text-muted-foreground">
      {count} {count === 1 ? 'step' : 'steps'}
      {first ? ` · ${first.title || first.stepId}` : ''}
    </span>
  );
}
