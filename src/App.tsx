import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import LoginGate from './components/LoginGate';

// Memory DB pages
import Messages from './pages/Messages';
import Cleanup from './pages/Cleanup';
import Sources from './pages/Sources';
import People from './pages/People';
import Attachments from './pages/Attachments';
import Tokens from './pages/Tokens';
import Settings from './pages/Settings';

// Custom service pages (existing, service-specific implementations)
import DiscordDashboard from './pages/discord/Dashboard';
import DiscordChannels from './pages/discord/Channels';
import DiscordBackfill from './pages/discord/Backfill';
import DiscordScheduled from './pages/discord/Scheduled';
import DiscordJobs from './pages/discord/Jobs';
import SlackDashboard from './pages/slack/Dashboard';
import SlackChannels from './pages/slack/Channels';
import SlackJobs from './pages/slack/Jobs';
import SlackBackfill from './pages/slack/Backfill';
import SlackScheduled from './pages/slack/Scheduled';
import ChatGPTDashboard from './pages/chatgpt/Dashboard';
import ChatGPTLive from './pages/chatgpt/Live';
import ChatGPTConversations from './pages/chatgpt/Conversations';
import ConversationView from './pages/chatgpt/ConversationView';
import ChatGPTJobs from './pages/chatgpt/Jobs';
import OpenClawDashboard from './pages/openclaw/Dashboard';
import OpenClawLiveSessions from './pages/openclaw/LiveSessions';
import OpenClawMemorySessions from './pages/openclaw/MemorySessions';
import OpenClawBackfill from './pages/openclaw/Backfill';
import IMessageConversations from './pages/imessage/Conversations';
import GmailDashboard from './pages/gmail/Dashboard';
import GmailMailboxes from './pages/gmail/Mailboxes';
import GmailEmailList from './pages/gmail/EmailList';
import GmailEmailView from './pages/gmail/EmailView';

// Unified reusable components
import ServiceStatus from './components/ServiceStatus';
import ServiceSubscriptions from './components/ServiceSubscriptions';
import ServiceMessages from './components/ServiceMessages';
import ServiceDiscovery from './components/ServiceDiscovery';
import ServiceDashboard from './components/ServiceDashboard';
import ServiceJobs from './components/ServiceJobs';
import ServiceBackfill from './components/ServiceBackfill';
import AppViewLive from './components/AppViewLive';
import AppViewDatabase from './components/AppViewDatabase';

import { getServiceConfig, checkHealth, ServiceConfig } from './api';

/* ── Service definitions ────────────────────────────────── */

interface ServiceDef {
  id: string;         // route prefix, e.g. 'discord'
  icon: string;
  label: string;
  serviceKey: string;  // backend service name for health checks
  sourceName: string;  // source name in memory DB
}

const SERVICES: ServiceDef[] = [
  { id: 'discord',   icon: '👾', label: 'Discord',   serviceKey: 'discord-ingestor',   sourceName: 'discord' },
  { id: 'gmail',     icon: '📨', label: 'Gmail',     serviceKey: 'gmail-ingestor',     sourceName: 'email' },
  { id: 'slack',     icon: '#️⃣', label: 'Slack',     serviceKey: 'slack-ingestor',     sourceName: 'slack' },
  { id: 'anthropic', icon: '✳️', label: 'Anthropic', serviceKey: 'anthropic-ingestor', sourceName: 'anthropic' },
  { id: 'chatgpt',   icon: '🌐', label: 'ChatGPT',  serviceKey: 'chatgpt-ingestor',   sourceName: 'chatgpt' },
  { id: 'openclaw',  icon: '🦞', label: 'OpenClaw',  serviceKey: 'openclaw-ingestor',  sourceName: 'openclaw' },
  { id: 'whatsapp', icon: '📱', label: 'WhatsApp',  serviceKey: 'whatsapp-ingestor', sourceName: 'whatsapp' },
];

/* iMessage is local (Mac Mini), no ingestor — custom sidebar */
const IMESSAGE_SECTION: SidebarSection = {
  key: 'imessage',
  icon: '💬',
  label: 'iMessage',
  items: [
    { to: '/imessage/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/imessage/messages',  icon: '✉️', label: 'Messages' },
    { to: '/imessage/conversations', icon: '💬', label: 'Conversations' },
  ],
};

/* ── Sidebar section type ───────────────────────────────── */

interface SidebarSection {
  key: string;
  icon: string;
  label: string;
  serviceKey?: string;
  items: { to: string; icon: string; label: string }[];
}

/* ── Build sidebar sections ─────────────────────────────── */

const STANDARD_PAGES = [
  { suffix: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { suffix: 'subscriptions', icon: '📋', label: 'Subscriptions' },
  { suffix: 'discovery',     icon: '🔍', label: 'Discovery' },
  { suffix: 'messages',      icon: '✉️', label: 'Messages' },
  { suffix: 'jobs',          icon: '📋', label: 'Jobs' },
  { suffix: 'backfill',      icon: '⏪', label: 'Backfill' },
  { suffix: 'app-live',      icon: '🔴', label: 'App View [Live]' },
  { suffix: 'app-db',        icon: '🗄️', label: 'App View [Database]' },
];

function buildServiceSection(svc: ServiceDef): SidebarSection {
  return {
    key: svc.id,
    icon: svc.icon,
    label: svc.serviceKey ? `${svc.label} Ingestor` : svc.label,
    serviceKey: svc.serviceKey || undefined,
    items: STANDARD_PAGES.map(p => ({
      to: `/${svc.id}/${p.suffix}`,
      icon: p.icon,
      label: p.label,
    })),
  };
}

const sections: SidebarSection[] = [
  {
    key: 'memory-db', icon: '🗄️', label: 'Memory DB', serviceKey: 'memory-api',
    items: [
      { to: '/memory/messages',    icon: '✉️', label: 'Messages' },
      { to: '/memory/cleanup',     icon: '🧹', label: 'Cleanup' },
      { to: '/memory/sources',     icon: '📡', label: 'Sources' },
      { to: '/memory/people',      icon: '👤', label: 'People' },
      { to: '/memory/attachments', icon: '📎', label: 'Attachments' },
      { to: '/memory/tokens',      icon: '🔑', label: 'Tokens' },
      { to: '/memory/settings',    icon: '⚙️', label: 'Settings' },
    ],
  },
  ...SERVICES.map(buildServiceSection),
  IMESSAGE_SECTION,
];

/* ── Collapsed state persistence ────────────────────────── */

function loadCollapsed(): Record<string, boolean> {
  const defaults: Record<string, boolean> = Object.fromEntries(sections.map(s => [s.key, true]));
  try {
    const saved = JSON.parse(localStorage.getItem('sidebar-collapsed') || '{}');
    return { ...defaults, ...saved };
  } catch { return defaults; }
}

/* ── App ────────────────────────────────────────────────── */

export default function App() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [serviceConfig, setServiceConfig] = useState<ServiceConfig>({});
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const location = useLocation();

  useEffect(() => {
    getServiceConfig().then(setServiceConfig).catch(() => {});
  }, []);

  useEffect(() => {
    for (const section of sections) {
      if (section.serviceKey && serviceConfig[section.serviceKey]?.configured) {
        checkHealth(section.serviceKey).then(ok => {
          setHealth(h => ({ ...h, [section.serviceKey!]: ok }));
        });
      }
    }
  }, [serviceConfig]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  const getStatusDot = (serviceKey?: string) => {
    if (!serviceKey) return null;
    const cfg = serviceConfig[serviceKey];
    if (!cfg?.configured) return <span className="status-dot grey" title="Not configured" />;
    const ok = health[serviceKey];
    if (ok === undefined) return <span className="status-dot grey" title="Checking..." />;
    return <span className={`status-dot ${ok ? 'green' : 'red'}`} title={ok ? 'Connected' : 'Unreachable'} />;
  };

  return (
    <LoginGate>
    <div className="app-layout">
      <button className="hamburger" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
      <nav className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          🧠 Data Hub
          {import.meta.env.VITE_BUILD_DATE && (
            <div style={{ fontSize: 10, color: '#555', fontWeight: 400, marginTop: 2 }}>
              {import.meta.env.VITE_BUILD_DATE}{import.meta.env.VITE_BUILD_SHA ? ` (${import.meta.env.VITE_BUILD_SHA})` : ''}
            </div>
          )}
        </div>
        <div className="sidebar-nav">
          {sections.map(section => {
            const svcDef = SERVICES.find(s => s.id === section.key);
            return (
              <div key={section.key} className="sidebar-section">
                <button className="section-header" onClick={() => toggle(section.key)}>
                  <span className="section-icon">{section.icon}</span>
                  <span className="section-label">{section.label}</span>
                  {getStatusDot(section.serviceKey)}
                  <span className={`chevron ${collapsed[section.key] ? 'collapsed' : ''}`}>▾</span>
                </button>
                {!collapsed[section.key] && (
                  <div className="section-items">
                    {svcDef && svcDef.serviceKey && (
                      <ServiceStatus serviceKey={svcDef.serviceKey} serviceId={svcDef.id} />
                    )}
                    {section.items.map(item => (
                      <NavLink key={item.to} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">
        <Routes>
          {/* ── Memory DB ─────────────────────────────────── */}
          <Route path="/memory/messages" element={<Messages />} />
          <Route path="/memory/cleanup" element={<Cleanup />} />
          <Route path="/memory/sources" element={<Sources />} />
          <Route path="/memory/people" element={<People />} />
          <Route path="/memory/attachments" element={<Attachments />} />
          <Route path="/memory/tokens" element={<Tokens />} />
          <Route path="/memory/settings" element={<Settings />} />

          {/* ── Discord ───────────────────────────────────── */}
          <Route path="/discord/dashboard" element={<DiscordDashboard />} />
          <Route path="/discord/subscriptions" element={<ServiceSubscriptions service="discord" serviceLabel="Discord" serviceIcon="👾" />} />
          <Route path="/discord/discovery" element={<ServiceDiscovery service="discord" serviceLabel="Discord" serviceIcon="👾" serviceKey="discord-ingestor" />} />
          <Route path="/discord/messages" element={<ServiceMessages source="discord" serviceLabel="Discord" serviceIcon="👾" />} />
          <Route path="/discord/jobs" element={<DiscordJobs />} />
          <Route path="/discord/backfill" element={<DiscordBackfill />} />
          <Route path="/discord/app-live" element={<AppViewLive service="discord" serviceLabel="Discord" serviceKey="discord-ingestor" />} />
          <Route path="/discord/app-db" element={<AppViewDatabase service="discord" serviceLabel="Discord" serviceKey="discord-ingestor" />} />
          {/* Legacy Discord routes */}
          <Route path="/discord/channels" element={<DiscordChannels />} />
          <Route path="/discord/scheduled" element={<DiscordScheduled />} />

          {/* ── Gmail ─────────────────────────────────────── */}
          <Route path="/gmail/dashboard" element={<GmailDashboard />} />
          <Route path="/gmail/subscriptions" element={<ServiceSubscriptions service="gmail" serviceLabel="Gmail" serviceIcon="📨" />} />
          <Route path="/gmail/discovery" element={<ServiceDiscovery service="gmail" serviceLabel="Gmail" serviceIcon="📨" serviceKey="gmail-ingestor" />} />
          <Route path="/gmail/messages" element={<ServiceMessages source="email" serviceLabel="Gmail" serviceIcon="📨" />} />
          <Route path="/gmail/jobs" element={<ServiceJobs service="gmail" serviceLabel="Gmail" serviceIcon="📨" serviceKey="gmail-ingestor" />} />
          <Route path="/gmail/backfill" element={<ServiceBackfill service="gmail" serviceLabel="Gmail" serviceIcon="📨" serviceKey="gmail-ingestor" />} />
          <Route path="/gmail/app-live" element={<AppViewLive service="gmail" serviceLabel="Gmail" serviceKey="gmail-ingestor" />} />
          <Route path="/gmail/app-db" element={<AppViewDatabase service="gmail" serviceLabel="Gmail" serviceKey="gmail-ingestor" />} />
          {/* Legacy Gmail routes */}
          <Route path="/gmail/mailboxes" element={<GmailMailboxes />} />
          <Route path="/gmail/mailbox/:mailbox" element={<GmailEmailList />} />
          <Route path="/gmail/email/:uid" element={<GmailEmailView />} />

          {/* ── Slack ─────────────────────────────────────── */}
          <Route path="/slack/dashboard" element={<SlackDashboard />} />
          <Route path="/slack/subscriptions" element={<ServiceSubscriptions service="slack" serviceLabel="Slack" serviceIcon="#️⃣" />} />
          <Route path="/slack/discovery" element={<ServiceDiscovery service="slack" serviceLabel="Slack" serviceIcon="#️⃣" serviceKey="slack-ingestor" />} />
          <Route path="/slack/messages" element={<ServiceMessages source="slack" serviceLabel="Slack" serviceIcon="#️⃣" />} />
          <Route path="/slack/jobs" element={<SlackJobs />} />
          <Route path="/slack/backfill" element={<SlackBackfill />} />
          <Route path="/slack/app-live" element={<AppViewLive service="slack" serviceLabel="Slack" serviceKey="slack-ingestor" />} />
          <Route path="/slack/app-db" element={<AppViewDatabase service="slack" serviceLabel="Slack" serviceKey="slack-ingestor" />} />
          {/* Legacy Slack routes */}
          <Route path="/slack/channels" element={<SlackChannels />} />
          <Route path="/slack/scheduled" element={<SlackScheduled />} />

          {/* ── Anthropic ─────────────────────────────────── */}
          <Route path="/anthropic/dashboard" element={<ServiceDashboard service="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" serviceKey="anthropic-ingestor" sourceName="anthropic" />} />
          <Route path="/anthropic/subscriptions" element={<ServiceSubscriptions service="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" />} />
          <Route path="/anthropic/discovery" element={<ServiceDiscovery service="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" serviceKey="anthropic-ingestor" />} />
          <Route path="/anthropic/messages" element={<ServiceMessages source="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" />} />
          <Route path="/anthropic/jobs" element={<ServiceJobs service="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" serviceKey="anthropic-ingestor" />} />
          <Route path="/anthropic/backfill" element={<ServiceBackfill service="anthropic" serviceLabel="Anthropic" serviceIcon="✳️" serviceKey="anthropic-ingestor" />} />
          <Route path="/anthropic/app-live" element={<AppViewLive service="anthropic" serviceLabel="Anthropic" serviceKey="anthropic-ingestor" />} />
          <Route path="/anthropic/app-db" element={<AppViewDatabase service="anthropic" serviceLabel="Anthropic" serviceKey="anthropic-ingestor" />} />

          {/* ── ChatGPT ───────────────────────────────────── */}
          <Route path="/chatgpt/dashboard" element={<ChatGPTDashboard />} />
          <Route path="/chatgpt/subscriptions" element={<ServiceSubscriptions service="chatgpt" serviceLabel="ChatGPT" serviceIcon="🌐" />} />
          <Route path="/chatgpt/discovery" element={<ServiceDiscovery service="chatgpt" serviceLabel="ChatGPT" serviceIcon="🌐" serviceKey="chatgpt-ingestor" />} />
          <Route path="/chatgpt/messages" element={<ServiceMessages source="chatgpt" serviceLabel="ChatGPT" serviceIcon="🌐" />} />
          <Route path="/chatgpt/jobs" element={<ChatGPTJobs />} />
          <Route path="/chatgpt/backfill" element={<ServiceBackfill service="chatgpt" serviceLabel="ChatGPT" serviceIcon="🌐" serviceKey="chatgpt-ingestor" />} />
          <Route path="/chatgpt/app-live" element={<AppViewLive service="chatgpt" serviceLabel="ChatGPT" serviceKey="chatgpt-ingestor" />} />
          <Route path="/chatgpt/app-db" element={<AppViewDatabase service="chatgpt" serviceLabel="ChatGPT" serviceKey="chatgpt-ingestor" />} />
          {/* Legacy ChatGPT routes */}
          <Route path="/chatgpt/live" element={<ChatGPTLive />} />
          <Route path="/chatgpt/conversations" element={<ChatGPTConversations />} />
          <Route path="/chatgpt/conversation/:id" element={<ConversationView />} />

          {/* ── OpenClaw ──────────────────────────────────── */}
          <Route path="/openclaw/dashboard" element={<OpenClawDashboard />} />
          <Route path="/openclaw/subscriptions" element={<ServiceSubscriptions service="openclaw" serviceLabel="OpenClaw" serviceIcon="🦞" />} />
          <Route path="/openclaw/discovery" element={<ServiceDiscovery service="openclaw" serviceLabel="OpenClaw" serviceIcon="🦞" serviceKey="openclaw-ingestor" />} />
          <Route path="/openclaw/messages" element={<ServiceMessages source="openclaw" serviceLabel="OpenClaw" serviceIcon="🦞" />} />
          <Route path="/openclaw/jobs" element={<ServiceJobs service="openclaw" serviceLabel="OpenClaw" serviceIcon="🦞" serviceKey="openclaw-ingestor" />} />
          <Route path="/openclaw/backfill" element={<OpenClawBackfill />} />
          <Route path="/openclaw/app-live" element={<AppViewLive service="openclaw" serviceLabel="OpenClaw" serviceKey="openclaw-ingestor" />} />
          <Route path="/openclaw/app-db" element={<AppViewDatabase service="openclaw" serviceLabel="OpenClaw" serviceKey="openclaw-ingestor" />} />
          {/* Legacy OpenClaw routes */}
          <Route path="/openclaw/live-sessions" element={<OpenClawLiveSessions />} />
          <Route path="/openclaw/memory-sessions" element={<OpenClawMemorySessions />} />

          {/* ── WhatsApp ─────────────────────────────────── */}
          <Route path="/whatsapp/dashboard" element={<ServiceDashboard service="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" serviceKey="whatsapp-ingestor" sourceName="whatsapp" />} />
          <Route path="/whatsapp/subscriptions" element={<ServiceSubscriptions service="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" />} />
          <Route path="/whatsapp/discovery" element={<ServiceDiscovery service="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" serviceKey="whatsapp-ingestor" />} />
          <Route path="/whatsapp/messages" element={<ServiceMessages source="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" />} />
          <Route path="/whatsapp/jobs" element={<ServiceJobs service="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" serviceKey="whatsapp-ingestor" />} />
          <Route path="/whatsapp/backfill" element={<ServiceBackfill service="whatsapp" serviceLabel="WhatsApp" serviceIcon="📱" serviceKey="whatsapp-ingestor" />} />
          <Route path="/whatsapp/app-live" element={<AppViewLive service="whatsapp" serviceLabel="WhatsApp" serviceKey="whatsapp-ingestor" />} />
          <Route path="/whatsapp/app-db" element={<AppViewDatabase service="whatsapp" serviceLabel="WhatsApp" serviceKey="whatsapp-ingestor" />} />

          {/* ── iMessage (local, no ingestor) ────────────── */}
          <Route path="/imessage/dashboard" element={<ServiceDashboard service="imessage" serviceLabel="iMessage" serviceIcon="💬" serviceKey="" sourceName="imessage" />} />
          <Route path="/imessage/messages" element={<ServiceMessages source="imessage" serviceLabel="iMessage" serviceIcon="💬" />} />
          <Route path="/imessage/conversations" element={<IMessageConversations />} />

          {/* ── Default ───────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/memory/messages" replace />} />
        </Routes>
      </main>
    </div>
    </LoginGate>
  );
}
