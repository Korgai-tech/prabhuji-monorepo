import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api-error';
import { isConflictError, notify } from '@/lib/toast';

import { useHomeSettings, useUpdateHomeSettings } from './use-home-settings';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Home settings — the SINGLETON (TAM-105 §(f)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A single GET + PATCH form — no list, no create, no delete. `feedTrendingFirst`
 * is the highest-blast-radius single field in the epic: flipping it reorders
 * EVERY user's home feed instantly. So the write is gated behind an EXPLICIT
 * confirmation that states the global, immediate effect. `PATCH` carries
 * `updatedAt`; a 409 → conflict toast. TAM-104 guarantees `GET` returns a row on
 * a fresh DB (never a 404) — if it 404s that is TAM-104's bug and it is surfaced
 * here, not papered over.
 */
export function SettingsPage() {
  const { data: settings, isLoading, isError, error, refetch } = useHomeSettings();

  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Home settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global configuration for the app’s home screen.
        </p>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load home settings</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error, 'Please try again.')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {settings && (
        <SettingsForm
          key={settings.updatedAt}
          feedTrendingFirst={settings.feedTrendingFirst}
          shortcutGridGradientEnabled={settings.shortcutGridGradientEnabled}
          updatedAt={settings.updatedAt}
        />
      )}
    </div>
  );
}

function SettingsForm({
  feedTrendingFirst,
  shortcutGridGradientEnabled,
  updatedAt,
}: {
  feedTrendingFirst: boolean;
  shortcutGridGradientEnabled: boolean;
  updatedAt: string;
}) {
  const update = useUpdateHomeSettings();
  const [value, setValue] = React.useState(feedTrendingFirst);
  const [gradient, setGradient] = React.useState(shortcutGridGradientEnabled);
  const [confirming, setConfirming] = React.useState(false);

  // Both switches ride on ONE `updatedAt` precondition, so they save together.
  const dirty = value !== feedTrendingFirst || gradient !== shortcutGridGradientEnabled;

  async function save() {
    try {
      await update.mutateAsync({
        feedTrendingFirst: value,
        shortcutGridGradientEnabled: gradient,
        expectedUpdatedAt: updatedAt,
      });
      notify.success('Home settings updated');
      setConfirming(false);
    } catch (err) {
      if (isConflictError(err)) {
        notify.conflict(
          () => setConfirming(false),
          'Home settings changed since you opened this page — reload and try again.',
        );
        setConfirming(false);
      } else {
        notify.error(err, 'Could not update home settings.');
      }
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Feed ordering</CardTitle>
          <CardDescription>
            When on, the feed is ordered by trending score first, then by curated
            order. When off, the feed uses curated order only.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="grid gap-0.5">
              <Label htmlFor="feed-trending-first">Trending first</Label>
              <span className="text-xs text-muted-foreground">
                Reorders every user’s home feed the moment it is saved.
              </span>
            </div>
            <Switch
              id="feed-trending-first"
              checked={value}
              onCheckedChange={(checked) => setValue(checked === true)}
            />
          </div>

          {/*
            TAM-174 — the shortcut-grid gradient experiment's kill switch.

            This is NOT the traffic split. Who lands in which arm is decided by
            the A/B console (or, while that is unwired, by a reviewed bucket map
            in the API). This switch only decides whether the experiment runs at
            all, and it is deliberately separate so that STOPPING it never
            depends on the A/B service being reachable.
          */}
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="grid gap-0.5">
              <Label htmlFor="shortcut-grid-gradient">Shortcut grid — colour experiment</Label>
              <span className="text-xs text-muted-foreground">
                When on, half of users see the new coloured shortcut tiles and half
                see the current design. Turning it off returns everyone to the
                current design immediately. Tiles with no palette set are
                unaffected either way.
              </span>
            </div>
            <Switch
              id="shortcut-grid-gradient"
              checked={gradient}
              onCheckedChange={(checked) => setGradient(checked === true)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!dirty || update.isPending}
              onClick={() => setConfirming(true)}
            >
              Save changes
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
                onClick={() => {
                  setValue(feedTrendingFirst);
                  setGradient(shortcutGridGradientEnabled);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={(open) => (!open ? setConfirming(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change home settings for everyone?</DialogTitle>
            <DialogDescription>
              {value !== feedTrendingFirst && (
                <>
                  {value
                    ? 'Turning trending-first ON reorders every user’s home feed immediately — trending content will jump to the top for all users.'
                    : 'Turning trending-first OFF returns every user’s home feed to curated order immediately.'}{' '}
                </>
              )}
              {gradient !== shortcutGridGradientEnabled && (
                <>
                  {gradient
                    ? 'Turning the shortcut-grid colour experiment ON starts showing the new coloured tiles to half of all users.'
                    : 'Turning the shortcut-grid colour experiment OFF returns every user to the current shortcut design.'}{' '}
                </>
              )}
              This takes effect instantly and affects all users.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={update.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={update.isPending} onClick={() => void save()}>
              {update.isPending ? 'Saving…' : 'Yes, change it for everyone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
