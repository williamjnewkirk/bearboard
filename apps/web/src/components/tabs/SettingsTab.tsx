'use client';

import { useUser } from '@clerk/nextjs';
import {
  NOTIFICATION_CATEGORY_META,
  notificationEnabled,
  type NotificationPrefs,
  type ReminderLead,
  type UploadMode,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { Membership } from '@/lib/team-types';
import { Button, Card, ErrorNote, Field, Modal, Spinner, inputCls, selectCls } from '../ui';

interface UserSettings {
  name: string;
  class_year: string | null;
  events: string | null;
  title: string | null;
  upload_mode: UploadMode;
  notification_prefs: NotificationPrefs;
  reminder_lead: ReminderLead;
}

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
];

export function SettingsTab({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const { user } = useUser();
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [codes, setCodes] = useState<Array<{ role: string; code: string }>>([]);
  const [team, setTeam] = useState({
    name: membership.team.name,
    school: membership.team.school ?? '',
    timezone: membership.team.timezone,
    feed: membership.team.feed_visible_to_athletes,
    nudge: membership.team.split_nudge_enabled,
  });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('users')
      .select('name, class_year, events, title, upload_mode, notification_prefs, reminder_lead')
      .eq('id', user?.id ?? '')
      .maybeSingle();
    if (error) setError(error.message);
    if (data) setSettings(data as unknown as UserSettings);

    if (isCoach) {
      const { data: codeData } = await sb
        .from('join_codes')
        .select('role, code')
        .eq('team_id', teamId)
        .eq('active', true);
      setCodes((codeData ?? []) as Array<{ role: string; code: string }>);
    }
  }, [getSupabase, user?.id, isCoach, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2000);
  }

  async function saveProfile() {
    if (!settings) return;
    const sb = await getSupabase();
    const { error } = await sb.rpc('update_profile', {
      p_name: settings.name,
      p_class_year: settings.class_year,
      p_events: settings.events,
      p_title: settings.title,
    });
    if (error) return setError(error.message);
    flash('Profile saved');
  }

  async function savePref(category: string, on: boolean) {
    if (!settings) return;
    const prefs = { ...settings.notification_prefs, [category]: on };
    setSettings({ ...settings, notification_prefs: prefs });
    const sb = await getSupabase();
    const { error } = await sb
      .from('users')
      .update({ notification_prefs: prefs })
      .eq('id', user?.id ?? '');
    if (error) setError(error.message);
  }

  async function saveUserField(
    patch: Partial<Pick<UserSettings, 'upload_mode' | 'reminder_lead'>>,
  ) {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    const sb = await getSupabase();
    const { error } = await sb
      .from('users')
      .update(patch)
      .eq('id', user?.id ?? '');
    if (error) setError(error.message);
  }

  async function saveTeam() {
    const sb = await getSupabase();
    const { error } = await sb
      .from('teams')
      .update({
        name: team.name.trim(),
        school: team.school.trim() || null,
        timezone: team.timezone,
        feed_visible_to_athletes: team.feed,
        split_nudge_enabled: team.nudge,
      })
      .eq('id', teamId);
    if (error) return setError(error.message);
    flash('Team settings saved');
    onChanged();
  }

  async function regenerate(role: 'athlete' | 'coach') {
    const sb = await getSupabase();
    const { error } = await sb.rpc('regenerate_join_code', { p_team_id: teamId, p_role: role });
    if (error) setError(error.message);
    await load();
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  async function deleteAccount() {
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('delete_account');
    if (error) return setError(error.message);
    try {
      await user?.delete();
    } catch (e) {
      setError(
        'Your BearBoard data was removed, but the sign-in identity could not be deleted automatically' +
          ` (${e instanceof Error ? e.message : String(e)}). Enable "Allow users to delete their accounts" in Clerk, or delete the user from the Clerk dashboard.`,
      );
      return;
    }
  }

  if (!settings) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-brand-forest">Settings</h1>
      <ErrorNote>{error}</ErrorNote>
      {saved ? <p className="text-sm font-medium text-brand-green">✓ {saved}</p> : null}

      {isCoach ? (
        <>
          <Card title="Team">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Team name">
                <input
                  className={inputCls}
                  value={team.name}
                  onChange={(e) => setTeam({ ...team, name: e.target.value })}
                />
              </Field>
              <Field label="School">
                <input
                  className={inputCls}
                  value={team.school}
                  onChange={(e) => setTeam({ ...team, school: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Team timezone (week boundaries, quiet hours)">
              <select
                className={`${selectCls} w-full`}
                value={team.timezone}
                onChange={(e) => setTeam({ ...team, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <label className="mb-2 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={team.feed}
                onChange={(e) => setTeam({ ...team, feed: e.target.checked })}
              />
              <span>
                <span className="font-medium">Team-visible feed</span> — athletes see teammates’
                activities and can like them. Off = feed is coach-only. Takes effect instantly;
                private notes, injury, and shoe data are never teammate-visible either way.
              </span>
            </label>
            <label className="mb-3 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={team.nudge}
                onChange={(e) => setTeam({ ...team, nudge: e.target.checked })}
              />
              <span>
                <span className="font-medium">Evening split nudge</span> — on workout days, athletes
                who haven’t logged splits get one gentle reminder (off by default).
              </span>
            </label>
            <Button onClick={() => void saveTeam()}>Save team settings</Button>
          </Card>

          <Card title="Join codes">
            <div className="space-y-2">
              {(['athlete', 'coach'] as const).map((role) => {
                const jc = codes.find((c) => c.role === role);
                return (
                  <div key={role} className="flex flex-wrap items-center gap-3">
                    <span className="w-16 text-sm capitalize text-gray-600">{role}</span>
                    <code className="rounded-lg bg-gray-100 px-3 py-1.5 text-lg font-bold tracking-widest text-brand-forest">
                      {jc?.code ?? '—'}
                    </code>
                    {jc ? (
                      <Button
                        small
                        variant={copied === jc.code ? 'secondary' : 'outline'}
                        onClick={() => void copyCode(jc.code)}
                      >
                        {copied === jc.code ? 'Copied!' : 'Copy'}
                      </Button>
                    ) : null}
                    <Button
                      small
                      variant="danger"
                      onClick={() => void regenerate(role)}
                      title="Invalidates the current code immediately"
                    >
                      Regenerate
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Share the athlete code with your roster (text, email, or write it on the whiteboard).
              The coach code is for assistant coaches. Regenerating kills the old code instantly.
            </p>
          </Card>
        </>
      ) : null}

      <Card title="Profile">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              className={inputCls}
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </Field>
          {isCoach ? (
            <Field label="Title">
              <input
                className={inputCls}
                value={settings.title ?? ''}
                placeholder="Head Coach"
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Class year">
              <input
                className={inputCls}
                value={settings.class_year ?? ''}
                placeholder="2028"
                onChange={(e) => setSettings({ ...settings, class_year: e.target.value })}
              />
            </Field>
          )}
        </div>
        {!isCoach ? (
          <Field label="Events">
            <input
              className={inputCls}
              value={settings.events ?? ''}
              placeholder="5k / 10k, steeple"
              onChange={(e) => setSettings({ ...settings, events: e.target.value })}
            />
          </Field>
        ) : null}
        <Button onClick={() => void saveProfile()}>Save profile</Button>
      </Card>

      {!isCoach ? (
        <Card title="Activity upload">
          <p className="mb-2 text-sm text-gray-500">
            How synced workouts reach the team. Manual entries always post immediately.
          </p>
          <div className="flex gap-2">
            {(['review', 'auto'] as const).map((m) => (
              <button
                key={m}
                onClick={() => void saveUserField({ upload_mode: m })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  settings.upload_mode === m
                    ? 'border-brand-maroon bg-brand-maroon/10 text-brand-maroon'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                {m === 'review' ? 'Review first (default)' : 'Auto-upload'}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Notifications">
        <p className="mb-3 text-sm text-gray-500">
          Every category is individually toggleable — mute what you don’t want without losing
          workout drops. Chats can also be muted per conversation. Quiet hours: 10 PM–6 AM team
          time.
        </p>
        {(['Training', 'Racing', 'Communication', 'Logistics', 'Optional nudges'] as const).map(
          (tier) => {
            const cats = NOTIFICATION_CATEGORY_META.filter((m) => m.tier === tier);
            if (!cats.length) return null;
            return (
              <div key={tier} className="mb-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-maroon">
                  {tier}
                </p>
                {cats.map((meta) => (
                  <label
                    key={meta.category}
                    className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 last:border-0"
                  >
                    <span>
                      <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                      <span className="block text-xs text-gray-400">{meta.description}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={notificationEnabled(settings.notification_prefs, meta.category)}
                      onChange={(e) => void savePref(meta.category, e.target.checked)}
                    />
                  </label>
                ))}
              </div>
            );
          },
        )}
        <Field label="Event reminder timing">
          <select
            className={selectCls}
            value={settings.reminder_lead}
            onChange={(e) => void saveUserField({ reminder_lead: e.target.value as ReminderLead })}
          >
            <option value="1h">1 hour before</option>
            <option value="morning_of">Morning of</option>
            <option value="off">Off</option>
          </select>
        </Field>
      </Card>

      <Card title="Danger zone">
        <p className="mb-3 text-sm text-gray-500">
          Deleting your account removes your sign-in and personal data (activities, injury history,
          shoes, debriefs). Team-facing records are anonymized as “Former member”. This cannot be
          undone.
        </p>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete my account
        </Button>
      </Card>

      {confirmDelete ? (
        <Modal title="Delete account?" onClose={() => setConfirmDelete(false)}>
          <p className="mb-4 text-sm text-gray-600">
            This permanently deletes your sign-in and personal data. Type is final — there is no
            undo. Are you sure?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void deleteAccount()}>
              Yes, delete everything
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
