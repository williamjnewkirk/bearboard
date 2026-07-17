'use client';

import { UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Flag,
  Activity,
  HeartPulse,
  MessageSquare,
  Megaphone,
  Clock,
  Users,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Membership } from '@/lib/team-types';
import { useSupabase } from '@/lib/useSupabase';
import { Logo } from './Logo';
import { ComplianceTab } from './tabs/ComplianceTab';
import { PlanGrid } from './plan/PlanGrid';
import { MeetsTab } from './tabs/MeetsTab';
import { FeedTab } from './tabs/FeedTab';
import { InjuryTab } from './tabs/InjuryTab';
import { MessagesTab } from './tabs/MessagesTab';
import { AnnouncementsTab } from './tabs/AnnouncementsTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { RosterTab } from './tabs/RosterTab';
import { SettingsTab } from './tabs/SettingsTab';

type TabKey =
  | 'dashboard'
  | 'plan'
  | 'meets'
  | 'feed'
  | 'injury'
  | 'messages'
  | 'announcements'
  | 'schedule'
  | 'roster'
  | 'settings';

const COACH_TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'plan', label: 'Plan', icon: CalendarDays },
  { key: 'meets', label: 'Meets', icon: Flag },
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'injury', label: 'Injury board', icon: HeartPulse },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'schedule', label: 'Schedule', icon: Clock },
  { key: 'roster', label: 'Roster & squads', icon: Users },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const ATHLETE_TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'schedule', label: 'Schedule', icon: Clock },
  { key: 'roster', label: 'Roster', icon: Users },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

/**
 * Signed-in, in-a-team shell: brand sidebar (top bar on small screens) +
 * the active tab. Coaches get the full command center; the athlete web view
 * is a companion (the app is the athlete surface — PRD §3.2).
 */
export function Dashboard({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const isCoach = membership.role === 'coach';
  const tabs = isCoach ? COACH_TABS : ATHLETE_TABS;
  const [tab, setTab] = useState<TabKey>(isCoach ? 'dashboard' : 'feed');
  const getSupabase = useSupabase();

  // Opportunistically publish any due scheduled details on load, so scheduled
  // releases work even before the push worker is scheduled (idempotent).
  useEffect(() => {
    void (async () => {
      const sb = await getSupabase();
      await sb.rpc('release_due_details');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* Sidebar (desktop) / top bar (mobile) */}
      <aside className="flex shrink-0 flex-col border-b border-gray-200 bg-white md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Logo size={30} />
          <div className="md:hidden">
            <UserButton />
          </div>
        </div>
        <div className="min-w-0 px-3 pb-2 md:pb-0">
          <p className="truncate text-sm font-semibold text-brand-forest">{membership.team.name}</p>
          <p className="truncate text-xs text-gray-500">
            {membership.team.school ? `${membership.team.school} · ` : ''}
            {isCoach ? 'Coach' : 'Athlete'}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:mt-2 md:flex-1 md:flex-col md:overflow-visible">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full ${
                  active
                    ? 'bg-brand-maroon/10 text-brand-maroon'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon
                  size={18}
                  className={
                    active ? 'text-brand-maroon' : 'text-gray-400 group-hover:text-gray-600'
                  }
                />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 border-t p-4 md:flex">
          <UserButton />
          <span className="text-xs text-gray-500">Account</span>
        </div>
      </aside>

      {/* Main pane */}
      <main className="min-w-0 flex-1 p-4 md:p-6">
        {tab === 'dashboard' && isCoach ? <ComplianceTab membership={membership} /> : null}
        {tab === 'plan' && isCoach ? <PlanGrid teamId={membership.team.id} /> : null}
        {tab === 'meets' ? <MeetsTab membership={membership} /> : null}
        {tab === 'feed' ? <FeedTab membership={membership} /> : null}
        {tab === 'injury' && isCoach ? <InjuryTab membership={membership} /> : null}
        {tab === 'messages' ? <MessagesTab membership={membership} /> : null}
        {tab === 'announcements' ? <AnnouncementsTab membership={membership} /> : null}
        {tab === 'schedule' ? <ScheduleTab membership={membership} /> : null}
        {tab === 'roster' ? <RosterTab membership={membership} onChanged={onChanged} /> : null}
        {tab === 'settings' ? <SettingsTab membership={membership} onChanged={onChanged} /> : null}
      </main>
    </div>
  );
}
