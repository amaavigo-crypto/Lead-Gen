import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileImage,
  ImagePlus,
  Instagram,
  Linkedin,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import type { AppUser } from '../types';

type StudioTab = 'overview' | 'channels' | 'compose' | 'calendar' | 'posts' | 'media' | 'analytics' | 'competitors';
type PostType = 'draft' | 'now' | 'schedule';

interface Props {
  tenantId: string;
  tenantName?: string;
  currentUser?: AppUser | null;
  onBackToLeadGen?: () => void;
}

interface Channel {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  profile?: string;
  disabled?: boolean;
}

interface PostMedia {
  id: string;
  path: string;
  name?: string;
  mimeType?: string;
  sourceAssetId?: string;
  createdAt?: string;
}

interface SocialPost {
  id?: string;
  group?: string;
  publishDate?: string;
  state?: string;
  releaseURL?: string;
  posts?: Array<{
    id?: string;
    state?: string;
    releaseURL?: string;
    integration?: { id?: string; name?: string; providerIdentifier?: string; profile?: string };
    value?: Array<{ content?: string; image?: Array<{ id?: string; path?: string }> }>;
  }>;
  [key: string]: any;
}

interface CompanyAsset {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  category?: string;
  url?: string;
}

const PROVIDERS = [
  { id: 'instagram', label: 'Instagram', detail: 'Connect a Business or Creator account', color: 'from-fuchsia-500 to-orange-400' },
  { id: 'facebook', label: 'Facebook', detail: 'Connect the Facebook Pages you manage', color: 'from-blue-600 to-blue-400' },
  { id: 'youtube', label: 'YouTube', detail: 'Connect a YouTube channel', color: 'from-red-600 to-red-400' },
  { id: 'x', label: 'X', detail: 'Connect your X account', color: 'from-slate-900 to-slate-600' },
  { id: 'linkedin', label: 'LinkedIn', detail: 'Connect a member or eligible organization account', color: 'from-sky-700 to-sky-500' },
  { id: 'reddit', label: 'Reddit', detail: 'Connect your Reddit account (subject to API approval)', color: 'from-orange-700 to-orange-500' },
];

const TAB_ITEMS: Array<{ id: StudioTab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'channels', label: 'Connected accounts', icon: Share2 },
  { id: 'compose', label: 'Create post', icon: Plus },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'posts', label: 'Posts', icon: Send },
  { id: 'media', label: 'Media library', icon: FileImage },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'competitors', label: 'Competitors', icon: Share2 },
];

const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const buttonPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d4ed7] disabled:cursor-not-allowed disabled:opacity-50';
const buttonSecondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-3 focus:ring-blue-100';
const tabClass = (active: boolean) =>
  'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ' +
  (active ? 'bg-[#eaf0ff] text-[#1749b8]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900');

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'The request could not be completed.');
  return data as T;
}

function formatDate(value?: string): string {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Date not set';
}

function postDate(post: SocialPost): string {
  return post.publishDate || post.date || post.scheduleDate || post.createdAt || '';
}

function getPostText(post: SocialPost): string {
  const first = post.posts?.[0]?.value?.[0]?.content;
  return String(first || post.content || post.message || 'No caption').trim();
}

function getPostChannels(post: SocialPost): string[] {
  const names = (post.posts || []).map((item) =>
    String(item.integration?.name || item.integration?.profile || item.integration?.providerIdentifier || '')
  ).filter(Boolean);
  return Array.from(new Set(names));
}

function getPostState(post: SocialPost): string {
  const states = (post.posts || []).map((item) => item.state).filter(Boolean);
  return String(post.state || states[0] || 'pending').toLowerCase();
}

function stateLabel(state: string): string {
  const value = state.toLowerCase();
  if (value.includes('publish') || value === 'published') return 'Published';
  if (value.includes('error') || value.includes('fail')) return 'Failed';
  if (value.includes('draft')) return 'Draft';
  if (value.includes('queue') || value.includes('scheduled')) return 'Scheduled';
  return value.replace(/[_-]/g, ' ') || 'Pending';
}

function stateClass(state: string): string {
  const value = state.toLowerCase();
  if (value.includes('publish') || value === 'published') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (value.includes('error') || value.includes('fail')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (value.includes('draft')) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (value.includes('queue') || value.includes('schedule')) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function providerName(identifier: string): string {
  const known = PROVIDERS.find((item) => item.id === identifier);
  return known?.label || identifier.replace(/[-_]/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function bytesLabel(bytes?: number): string {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
  return (value / 1024 / 1024).toFixed(1) + ' MB';
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'social_' + Date.now() + '_' + Math.random().toString(36).slice(2, 14);
}

function localDateTimeOffset(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export const SocialStudioView: React.FC<Props> = ({ tenantId, tenantName, currentUser, onBackToLeadGen }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [status, setStatus] = useState<any>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [companyAssets, setCompanyAssets] = useState<CompanyAsset[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>('now');
  const [instagramPostType, setInstagramPostType] = useState<'post' | 'story'>('post');
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('professional and engaging');
  const [aiAudience, setAiAudience] = useState('our customers and community');
  const [aiGoal, setAiGoal] = useState('build awareness and encourage meaningful engagement');
  const [aiBusy, setAiBusy] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(localDateTimeOffset(2));
  const [selectedAnalyticsChannel, setSelectedAnalyticsChannel] = useState('');
  const [analyticsDays, setAnalyticsDays] = useState('30');
  const [analytics, setAnalytics] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [competitorProvider, setCompetitorProvider] = useState('youtube');
  const [competitorHandle, setCompetitorHandle] = useState('');
  const [competitorBusy, setCompetitorBusy] = useState(false);
  const [competitorAnalysis, setCompetitorAnalysis] = useState<any>(null);
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubePrivacy, setYoutubePrivacy] = useState('private');
  const [redditSubreddit, setRedditSubreddit] = useState('');
  const [redditTitle, setRedditTitle] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState('');
  const [fileError, setFileError] = useState('');

  const canManageChannels = currentUser?.role === 'ADMIN';
  const canPublish = canManageChannels || (currentUser?.allowedModules || []).includes('social-studio-publish');
  useEffect(() => {
    if (!canPublish && postType !== 'draft') setPostType('draft');
  }, [canPublish, postType]);


  const provisioned = Boolean(status?.provisioned);

  const loadCore = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const nextStatus = await api<any>('/api/social-studio/status');
      setStatus(nextStatus);
      if (!nextStatus.provisioned) {
        setChannels([]);
        setPosts([]);
        setMedia([]);
        setCompetitors([]);
        return;
      }
      const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      const query = new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() });
      const [channelResult, postResult, mediaResult, competitorResult] = await Promise.all([
        api<any>('/api/social-studio/channels'),
        api<any>('/api/social-studio/posts?' + query.toString()),
        api<any>('/api/social-studio/media'),
        api<any>('/api/social-studio/competitors'),
      ]);
      const nextChannels = Array.isArray(channelResult.channels) ? channelResult.channels : [];
      const nextPosts = Array.isArray(postResult.posts) ? postResult.posts : Array.isArray(postResult) ? postResult : [];
      const nextMedia = Array.isArray(mediaResult.media) ? mediaResult.media : [];
      const nextCompetitors = Array.isArray(competitorResult.competitors) ? competitorResult.competitors : [];
      setChannels(nextChannels);
      setPosts(nextPosts);
      setMedia(nextMedia);
      setCompetitors(nextCompetitors);
      setSelectedChannelIds((previous) => previous.filter((id) => nextChannels.some((channel: Channel) => channel.id === id && !channel.disabled)));
      setSelectedAnalyticsChannel((previous) => nextChannels.some((channel: Channel) => channel.id === previous) ? previous : (nextChannels[0]?.id || ''));
    } catch (requestError: any) {
      setError(requestError?.message || 'Could not load Social Studio.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calendarMonth]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthState = params.get('social_oauth') || '';
      const oauthProvider = params.get('provider') || '';
      const returnedFromConnect = params.get('social_connected') === '1' || oauthState === 'connected' || oauthState === 'error';
      if (returnedFromConnect) {
        if (oauthState === 'error') setError((providerName(oauthProvider || 'social account')) + ' authorization could not be completed. Check the provider app permissions, redirect URI and server credentials, then reconnect.');
        else setNotice('Checking ' + providerName(oauthProvider || 'social account') + ' connection…');
        params.delete('social_connected');
        params.delete('social_oauth');
        params.delete('provider');
        params.delete('added');
        params.delete('msg');
        const query = params.toString();
        window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      }
      await loadCore(false);
      if (active && returnedFromConnect && oauthState !== 'error') {
        setNotice(providerName(oauthProvider || 'Social account') + ' connection check complete. Review Connected Accounts for the verified channel status.');
      }
    };
    void run();
    return () => { active = false; };
  }, [tenantId, loadCore]);

  const loadCompanyAssets = useCallback(async () => {
    try {
      const result = await api<any>('/api/assets');
      setCompanyAssets(Array.isArray(result.assets) ? result.assets : []);
    } catch (assetError: any) {
      setFileError(assetError?.message || 'Could not load Company Assets.');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'media' || activeTab === 'compose') void loadCompanyAssets();
  }, [activeTab, loadCompanyAssets]);

  const handleConnect = async (provider: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api<{ url: string }>('/api/social-studio/channels/connect/' + encodeURIComponent(provider), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!response.url) throw new Error('Amaavigo did not return a connection URL.');
      window.location.assign(response.url);
    } catch (connectError: any) {
      setError(connectError?.message || 'Could not start the connection flow.');
      setBusy(false);
    }
  };

  const handleReconnect = async (channel: Channel) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api<{ url: string }>('/api/social-studio/channels/connect/' + encodeURIComponent(channel.identifier), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!response.url) throw new Error('Amaavigo did not return a reconnect URL.');
      window.location.assign(response.url);
    } catch (reconnectError: any) {
      setError(reconnectError?.message || 'Could not start the reconnect flow.');
      setBusy(false);
    }
  };

  const handleDisconnect = async (channel: Channel) => {
    if (!window.confirm('Disconnect ' + (channel.name || providerName(channel.identifier)) + ' from this Amaavigo workspace? Existing published content on the social platform will remain live. Continue?')) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/social-studio/channels/' + encodeURIComponent(channel.identifier), { method: 'DELETE' });
      setNotice('The social account was disconnected from this workspace.');
      await loadCore(true);
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Could not disconnect this account.');
    } finally {
      setBusy(false);
    }
  };

  const importCompanyAsset = async (assetId: string) => {
    setUploadBusy(true);
    setFileError('');
    try {
      const result = await api<any>('/api/social-studio/media/upload', {
        method: 'POST',
        body: JSON.stringify({ assetId }),
      });
      const item = result.media as PostMedia;
      setMedia((previous) => [item, ...previous.filter((mediaItem) => mediaItem.id !== item.id)]);
      setSelectedMediaIds((previous) => previous.includes(item.id) ? previous : [...previous, item.id]);
      setNotice('Media uploaded to Social Studio.');
    } catch (uploadError: any) {
      setFileError(uploadError?.message || 'Could not add this asset to Social Studio.');
    } finally {
      setUploadBusy(false);
    }
  };

  const uploadNewFile = async (file?: File | null) => {
    if (!file) return;
    setFileError('');
    if (file.size > 6 * 1024 * 1024) {
      setFileError('For uploads larger than 6 MB, first add the file through your server-side Company Assets workflow. Direct browser uploads are capped here to protect request size.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'video/mp4'];
    if (!allowed.includes(file.type.toLowerCase())) {
      setFileError('Use a JPG, PNG, GIF, WebP, AVIF or MP4 file.');
      return;
    }
    setUploadBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected file.'));
        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.readAsDataURL(file);
      });
      const created = await api<any>('/api/assets', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          category: file.type.startsWith('video/') ? 'VIDEO' : 'OTHER',
          dataUrl,
        }),
      });
      if (!created?.asset?.id) throw new Error('Company Assets did not return a saved file.');
      setCompanyAssets((previous) => [created.asset, ...previous.filter((asset) => asset.id !== created.asset.id)]);
      await importCompanyAsset(created.asset.id);
    } catch (uploadError: any) {
      setFileError(uploadError?.message || 'Could not save and upload this file.');
    } finally {
      setUploadBusy(false);
    }
  };

  const generateCaption = async () => {
    if (!aiTopic.trim()) {
      setError('Add a topic or campaign brief before generating a caption.');
      return;
    }
    setAiBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ caption: string }>('/api/social-studio/ai/caption', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic.trim(),
          tone: aiTone,
          audience: aiAudience,
          goal: aiGoal,
          platforms: selectedChannelIds.map((id) => {
            const channel = channels.find((item) => item.id === id);
            return channel ? providerName(channel.identifier) : '';
          }).filter(Boolean),
        }),
      });
      if (!result.caption) throw new Error('AI did not return a caption.');
      setContent(result.caption);
      setNotice('AI caption generated. Review it carefully before publishing.');
    } catch (aiError: any) {
      setError(aiError?.message || 'Could not generate a caption.');
    } finally {
      setAiBusy(false);
    }
  };

  const submitPost = async () => {
    setError('');
    setNotice('');
    if (!selectedChannelIds.length) {
      setError('Choose at least one connected social account.');
      return;
    }
    if (!content.trim() && !selectedMediaIds.length) {
      setError('Write a caption or add media before continuing.');
      return;
    }
    let publishDate = new Date().toISOString();
    if (postType === 'schedule') {
      const parsed = new Date(scheduledAt);
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setError('Choose a future date and time for the scheduled post.');
        return;
      }
      publishDate = parsed.toISOString();
    }
    setBusy(true);
    try {
      await api('/api/social-studio/posts', {
        method: 'POST',
        body: JSON.stringify({
          requestId: makeRequestId(),
          type: postType,
          date: publishDate,
          content: content.trim(),
          integrationIds: selectedChannelIds,
          mediaIds: selectedMediaIds,
          providerSettings: Object.fromEntries(
            selectedChannelIds.map((id) => {
              const channel = channels.find((item) => item.id === id);
              if (channel?.identifier === 'instagram') return [id, { post_type: instagramPostType }];
              if (channel?.identifier === 'youtube') return [id, { title: youtubeTitle.trim(), privacyStatus: youtubePrivacy }];
              if (channel?.identifier === 'reddit') return [id, { subreddit: redditSubreddit.trim(), title: redditTitle.trim() }];
              return [id, {}];
            })
          ),
        }),
      });
      setContent('');
      setSelectedMediaIds([]);
      setPostType('now');
      setNotice(postType === 'draft' ? 'Your draft was saved.' : postType === 'schedule' ? 'Your post was scheduled.' : 'Your post was submitted for publishing.');
      setActiveTab('posts');
      await loadCore(true);
    } catch (postError: any) {
      setError(postError?.message || 'Could not submit this post.');
    } finally {
      setBusy(false);
    }
  };

  const deletePost = async (post: SocialPost) => {
    const id = post.id || post.group;
    if (!id) return;
    if (!window.confirm('Delete this draft or scheduled post? Published posts may not be removable from the social network.')) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/social-studio/posts/' + encodeURIComponent(id), { method: 'DELETE' });
      setNotice('The post was removed from Social Studio.');
      await loadCore(true);
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not delete this post.');
    } finally {
      setBusy(false);
    }
  };

  const loadAnalytics = async () => {
    if (!selectedAnalyticsChannel) return;
    setAnalyticsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ integrationId: selectedAnalyticsChannel, days: analyticsDays });
      const result = await api<any>('/api/social-studio/analytics?' + params.toString());
      setAnalytics(result.analytics);
    } catch (analyticsError: any) {
      setError(analyticsError?.message || 'Analytics are not available for this channel.');
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const addCompetitor = async () => {
    if (!competitorHandle.trim()) { setError('Enter a competitor username, channel ID or subreddit.'); return; }
    setCompetitorBusy(true); setError(''); setNotice('');
    try {
      const result = await api<any>('/api/social-studio/competitors', {
        method: 'POST',
        body: JSON.stringify({ provider: competitorProvider, handle: competitorHandle.trim() }),
      });
      setCompetitors((previous) => [result.competitor, ...previous.filter((item) => item.id !== result.competitor.id)]);
      setCompetitorHandle('');
      setNotice('Competitor saved. Select Analyze to retrieve provider-supported public information.');
    } catch (e: any) { setError(e?.message || 'Could not save this competitor.'); }
    finally { setCompetitorBusy(false); }
  };

  const analyzeCompetitor = async (competitorId: string) => {
    setCompetitorBusy(true); setError(''); setNotice(''); setCompetitorAnalysis(null);
    try {
      const result = await api<any>('/api/social-studio/competitors/analyze', {
        method: 'POST', body: JSON.stringify({ competitorId }),
      });
      setCompetitorAnalysis(result.analysis);
      setCompetitors((previous) => previous.map((item) => item.id === competitorId ? { ...item, lastAnalysis: result.analysis, lastAnalyzedAt: new Date().toISOString() } : item));
    } catch (e: any) { setError(e?.message || 'Could not analyze this competitor with the connected provider permissions.'); }
    finally { setCompetitorBusy(false); }
  };

  const deleteCompetitor = async (competitorId: string) => {
    setCompetitorBusy(true); setError('');
    try {
      await api('/api/social-studio/competitors/' + encodeURIComponent(competitorId), { method: 'DELETE' });
      setCompetitors((previous) => previous.filter((item) => item.id !== competitorId));
      if (competitorAnalysis?.id === competitorId) setCompetitorAnalysis(null);
    } catch (e: any) { setError(e?.message || 'Could not remove this competitor.'); }
    finally { setCompetitorBusy(false); }
  };

  const filteredProviders = useMemo(() => {
    const term = connectionSearch.trim().toLowerCase();
    return PROVIDERS.filter((provider) => !term || provider.label.toLowerCase().includes(term));
  }, [connectionSearch]);

  const scheduledPosts = useMemo(() => posts.filter((post) => {
    const state = getPostState(post);
    return state.includes('queue') || state.includes('schedule') || state.includes('pending');
  }), [posts]);

  const publishedPosts = useMemo(() => posts.filter((post) => {
    const state = getPostState(post);
    return state.includes('publish') || state === 'published';
  }), [posts]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const offset = firstDay.getDay();
    const count = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: count }, (_, index) => {
      const day = index - offset + 1;
      const date = day > 0 && day <= daysInMonth
        ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
        : null;
      const dayPosts = date ? posts.filter((post) => {
        const parsed = new Date(postDate(post));
        return Number.isFinite(parsed.getTime()) &&
          parsed.getFullYear() === date.getFullYear() &&
          parsed.getMonth() === date.getMonth() &&
          parsed.getDate() === date.getDate();
      }) : [];
      return { day, date, posts: dayPosts };
    });
  }, [calendarMonth, posts]);

  const openComposeForDay = (date: Date) => {
    setPostType('schedule');
    setScheduledAt(localDateTimeOffset(1));
    const target = new Date(date);
    target.setHours(10, 0, 0, 0);
    if (target.getTime() <= Date.now()) target.setTime(Date.now() + 60 * 60 * 1000);
    const local = new Date(target.getTime() - target.getTimezoneOffset() * 60_000);
    setScheduledAt(local.toISOString().slice(0, 16));
    setActiveTab('compose');
  };

  const todayCount = posts.filter((post) => {
    const date = new Date(postDate(post));
    const now = new Date();
    return Number.isFinite(date.getTime()) &&
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }).length;

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        Loading Social Studio…
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 pb-8">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-[#081a45] via-[#102c67] to-[#1653a5] p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-blue-200">
              <Share2 className="h-4 w-4" /> Amaavigo Social Studio
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your social channels, in one place.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
              Create content once, adapt it across your connected social accounts and manage publishing and scheduling from Amaavigo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onBackToLeadGen && (
              <button type="button" onClick={onBackToLeadGen} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-white/15">
                <ArrowLeft className="h-4 w-4" /> Lead Generation
              </button>
            )}
            <button type="button" onClick={() => loadCore(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-[#12346f] transition hover:bg-blue-50 disabled:opacity-60">
              <RefreshCw className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')} /> Refresh
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-blue-100">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{tenantName || 'Your workspace'}</span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{channels.length} connected account{channels.length === 1 ? '' : 's'}</span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{scheduledPosts.length} upcoming post{scheduledPosts.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {(error || notice) && (
        <div className={'flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ' + (error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!status?.provisioned && (
        <div className={panel + ' p-6'}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><Settings2 className="h-6 w-6" /></div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Social Studio is not connected to the publishing service yet</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Connect your social accounts directly from this workspace. Each account is authorized securely with its own social platform.
              </p>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <strong className="text-slate-800">How it works:</strong> choose a social platform below and authorize the account on its official website. Your connection is encrypted and isolated to this workspace.
              </div>
            </div>
          </div>
        </div>
      )}

      {status?.provisioned && (
        <>
          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setError(''); }} className={tabClass(activeTab === tab.id)}>
                  <Icon className="h-4 w-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Connected accounts', value: channels.length, icon: Share2, note: 'Social profiles connected' },
                  { label: 'Scheduled posts', value: scheduledPosts.length, icon: Clock3, note: 'Waiting to publish' },
                  { label: 'Published this month', value: publishedPosts.length, icon: CheckCircle2, note: 'In the loaded month' },
                  { label: 'Posts today', value: todayCount, icon: CalendarDays, note: 'Across connected channels' },
                ].map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className={panel + ' p-4'}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">{metric.label}</span>
                        <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Icon className="h-4 w-4" /></span>
                      </div>
                      <div className="mt-3 text-2xl font-bold text-slate-900">{metric.value}</div>
                      <p className="mt-1 text-xs text-slate-400">{metric.note}</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
                <section className={panel + ' p-5'}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Upcoming posts</h2>
                      <p className="mt-1 text-xs text-slate-500">Your next scheduled publications</p>
                    </div>
                    <button type="button" className={buttonSecondary} onClick={() => setActiveTab('calendar')}>Open calendar <ArrowUpRight className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {scheduledPosts.slice(0, 4).map((post, index) => (
                      <div key={post.id || post.group || index} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                        <div className="rounded-lg bg-blue-50 p-2 text-blue-700"><CalendarDays className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-800">{getPostText(post)}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(postDate(post))}</p>
                          <p className="mt-1 text-xs text-slate-400">{getPostChannels(post).join(' · ') || 'Connected channels'}</p>
                        </div>
                        <span className={'shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ' + stateClass(getPostState(post))}>{stateLabel(getPostState(post))}</span>
                      </div>
                    ))}
                    {!scheduledPosts.length && <EmptyState title="Nothing scheduled yet" description="Create a post and choose a future publishing time to see it here." action="Create a post" onClick={() => setActiveTab('compose')} />}
                  </div>
                </section>
                <section className={panel + ' p-5'}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Connected accounts</h2>
                      <p className="mt-1 text-xs text-slate-500">Channels available to this workspace</p>
                    </div>
                    <button type="button" onClick={() => setActiveTab('channels')} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Manage</button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {channels.slice(0, 5).map((channel) => <ChannelRow key={channel.id} channel={channel} />)}
                    {!channels.length && <EmptyState title="No accounts connected" description="Connect your first social profile to start publishing." action={canManageChannels ? 'Connect account' : undefined} onClick={() => setActiveTab('channels')} />}
                  </div>
                </section>
              </div>
              <section className={panel + ' p-5'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Start creating</h2>
                    <p className="mt-1 text-xs text-slate-500">Create, schedule and review social content without leaving Amaavigo.</p>
                  </div>
                  <button type="button" className={buttonPrimary} onClick={() => setActiveTab('compose')}><Plus className="h-4 w-4" /> Create post</button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <QuickAction icon={Plus} title="Create content" text="Write a caption and select accounts." onClick={() => setActiveTab('compose')} />
                  <QuickAction icon={CalendarDays} title="Plan your calendar" text="Review and organize upcoming posts." onClick={() => setActiveTab('calendar')} />
                  <QuickAction icon={ImagePlus} title="Organize media" text="Reuse images and videos from Company Assets." onClick={() => setActiveTab('media')} />
                </div>
              </section>
            </div>
          )}

          {activeTab === 'channels' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Connected accounts</h2>
                  <p className="mt-1 text-sm text-slate-500">Each social account is authorized by its owner and isolated to this workspace.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{channels.length} connected</span>
              </div>
              <section className={panel + ' p-5'}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Your social channels</h3>
                    <p className="mt-1 text-xs text-slate-500">Reconnect an account if its authorization expires or is revoked.</p>
                  </div>
                  <button type="button" className={buttonSecondary} onClick={() => loadCore(true)} disabled={refreshing}><RefreshCw className="h-4 w-4" /> Refresh channels</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {channels.map((channel) => (
                    <div key={channel.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3">
                      <ChannelAvatar channel={channel} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{channel.name || providerName(channel.identifier)}</p>
                        <p className="truncate text-xs text-slate-500">{channel.profile || providerName(channel.identifier)}</p>
                        <span className={'mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (channel.disabled ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{channel.disabled ? 'Reconnect required' : 'Connected'}</span>
                      </div>
                      {canManageChannels && channel.disabled && (
                        <button type="button" onClick={() => void handleReconnect(channel)} disabled={busy} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                          Reconnect
                        </button>
                      )}
                      {canManageChannels && (
                        <button type="button" onClick={() => void handleDisconnect(channel)} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Disconnect social account">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!channels.length && <div className="col-span-full"><EmptyState title="No social accounts connected" description="Choose a platform below to connect your first account." /></div>}
                </div>
              </section>

              <section className={panel + ' p-5'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Connect another account</h3>
                    <p className="mt-1 text-xs text-slate-500">Select a provider. You will authorize the account on the provider's own website.</p>
                  </div>
                  <input className="max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Search platforms…" value={connectionSearch} onChange={(event) => setConnectionSearch(event.target.value)} />
                </div>
                {!canManageChannels && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Ask your workspace administrator to connect or disconnect social accounts.</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProviders.map((provider) => {
                    const Icon = provider.id.startsWith('instagram') ? Instagram : provider.id === 'linkedin' ? Linkedin : provider.id === 'youtube' ? Youtube : provider.id === 'threads' ? MessageCircle : Share2;
                    const alreadyConnected = channels.some((channel) => channel.identifier === provider.id);
                    return (
                      <div key={provider.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/30">
                        <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ' + provider.color + ' text-white shadow-sm'}><Icon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{provider.label}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">{provider.detail}</p>
                        </div>
                        <button type="button" onClick={() => void handleConnect(provider.id)} disabled={!canManageChannels || busy || alreadyConnected} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
                          {alreadyConnected ? 'Added' : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-400">Not every native-platform feature is available through publishing APIs. Availability depends on platform permissions, account type and provider support.</p>
              </section>
            </div>
          )}

          {activeTab === 'compose' && (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className={panel + ' p-5'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Create a post</h2>
                    <p className="mt-1 text-sm text-slate-500">Choose the channels, add content and decide when it should publish.</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-blue-600" />
                </div>
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Sparkles className="h-4 w-4 text-blue-700" /> AI caption assistant
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Generate a first draft from a short brief. Review factual claims, offers and hashtags before you publish.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">
                      What is this post about?
                      <input className={inputClass + ' mt-1'} value={aiTopic} onChange={(event) => setAiTopic(event.target.value)} placeholder="e.g. New product launch, seasonal offer, company update…" maxLength={1200} />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Tone
                      <select className={inputClass + ' mt-1'} value={aiTone} onChange={(event) => setAiTone(event.target.value)}>
                        <option value="professional and engaging">Professional and engaging</option>
                        <option value="friendly and conversational">Friendly and conversational</option>
                        <option value="premium and aspirational">Premium and aspirational</option>
                        <option value="bold and energetic">Bold and energetic</option>
                        <option value="informative and educational">Informative and educational</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Goal
                      <select className={inputClass + ' mt-1'} value={aiGoal} onChange={(event) => setAiGoal(event.target.value)}>
                        <option value="build awareness and encourage meaningful engagement">Awareness and engagement</option>
                        <option value="encourage people to visit our website">Website visits</option>
                        <option value="generate qualified enquiries">Generate enquiries</option>
                        <option value="announce news or an update">Share an announcement</option>
                        <option value="promote an offer without inventing details">Promote an offer</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">
                      Audience
                      <input className={inputClass + ' mt-1'} value={aiAudience} onChange={(event) => setAiAudience(event.target.value)} maxLength={180} />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => void generateCaption()} disabled={aiBusy || !aiTopic.trim()} className={buttonPrimary}>
                      {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {aiBusy ? 'Writing caption…' : 'Generate caption'}
                    </button>
                  </div>
                </div>
                <div className="mt-5">
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Caption / post text</label>
                  <textarea className={inputClass + ' min-h-[170px] resize-y'} placeholder="What would you like to share with your audience?" value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} />
                  <div className="mt-1 text-right text-[11px] text-slate-400">{content.length.toLocaleString()} / 20,000</div>
                </div>
                {selectedChannelIds.some((id) => channels.find((channel) => channel.id === id)?.identifier.startsWith('instagram')) && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="text-xs font-semibold text-slate-700">Instagram content type</label>
                    <select className={inputClass + ' mt-2'} value={instagramPostType} onChange={(event) => setInstagramPostType(event.target.value as 'post' | 'story')}>
                      <option value="post">Feed post / Reel (video is published as a Reel)</option>
                      <option value="story">Story</option>
                    </select>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">Instagram Story publishing is limited to eligible Business accounts. Other platform-specific restrictions still apply.</p>
                  </div>
                )}
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">Publish to</label>
                    <span className="text-[11px] text-slate-400">{selectedChannelIds.length} selected</span>
                  </div>
                  {channels.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {channels.filter((channel) => !channel.disabled).map((channel) => (
                        <label key={channel.id} className={'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ' + (selectedChannelIds.includes(channel.id) ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50')}>
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={selectedChannelIds.includes(channel.id)} onChange={(event) => setSelectedChannelIds((previous) => event.target.checked ? [...previous, channel.id] : previous.filter((id) => id !== channel.id))} />
                          <ChannelAvatar channel={channel} small />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{channel.name || providerName(channel.identifier)}</span>
                          {selectedChannelIds.includes(channel.id) && <Check className="h-4 w-4 text-blue-600" />}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
                      <p className="text-sm font-semibold text-slate-700">Connect a social account first</p>
                      <button type="button" className="mt-2 text-xs font-semibold text-blue-700" onClick={() => setActiveTab('channels')}>Go to Connected Accounts</button>
                    </div>
                  )}
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Media</label>
                    <button type="button" onClick={() => setActiveTab('media')} className="text-xs font-semibold text-blue-700">Open media library</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {media.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedMediaIds((previous) => previous.includes(item.id) ? previous.filter((id) => id !== item.id) : [...previous, item.id])} className={'flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs ' + (selectedMediaIds.includes(item.id) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                        {item.mimeType?.startsWith('video/') ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                        <span className="max-w-[160px] truncate">{item.name || item.id}</span>
                        {selectedMediaIds.includes(item.id) && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                    {!media.length && <span className="text-xs text-slate-400">No media uploaded yet.</span>}
                  </div>
                </div>
                {selectedChannelIds.some((id) => channels.find((channel) => channel.id === id)?.identifier === 'youtube') && (
                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">YouTube title
                      <input className={inputClass + ' mt-1'} value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} maxLength={100} placeholder="Video title (defaults to first caption line)" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">YouTube visibility
                      <select className={inputClass + ' mt-1'} value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)}>
                        <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
                      </select>
                    </label>
                    <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">YouTube requires a video file. New uploads default to Private until you explicitly choose another visibility setting.</p>
                  </div>
                )}
                {selectedChannelIds.some((id) => channels.find((channel) => channel.id === id)?.identifier === 'reddit') && (
                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">Subreddit
                      <input className={inputClass + ' mt-1'} value={redditSubreddit} onChange={(event) => setRedditSubreddit(event.target.value)} placeholder="e.g. smallbusiness" />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">Reddit post title
                      <input className={inputClass + ' mt-1'} value={redditTitle} onChange={(event) => setRedditTitle(event.target.value)} maxLength={300} placeholder="A clear, community-appropriate title" />
                    </label>
                    <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">Reddit publishing stays disabled until Amaavigo receives commercial Data API approval. Follow each subreddit’s rules and self-promotion policy.</p>
                  </div>
                )}
                <div className="mt-5">
                  <label className="mb-2 block text-xs font-semibold text-slate-700">When should it publish?</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      ['now', 'Publish now', 'Send immediately'],
                      ['schedule', 'Schedule', 'Choose a date and time'],
                      ['draft', 'Save draft', 'Finish it later'],
                    ] as Array<[PostType, string, string]>).map(([type, label, detail]) => (
                      <button key={type} type="button" disabled={type !== 'draft' && !canPublish} onClick={() => setPostType(type)} className={'rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ' + (postType === type ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')}>
                        <span className="block text-sm font-semibold text-slate-800">{label}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">{type !== 'draft' && !canPublish ? 'Publisher permission required' : detail}</span>
                      </button>
                    ))}
                  </div>
                  {postType === 'schedule' && (
                    <input type="datetime-local" className={inputClass + ' mt-3'} value={scheduledAt} min={localDateTimeOffset(0)} onChange={(event) => setScheduledAt(event.target.value)} />
                  )}
                  {!canPublish && <p className="mt-2 text-[11px] text-amber-700">Your role can save drafts. Ask a workspace administrator to grant social-studio-publish before publishing or scheduling.</p>}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" className={buttonSecondary} onClick={() => { setContent(''); setSelectedMediaIds([]); setError(''); }}>Clear</button>
                  <button type="button" className={buttonPrimary} onClick={() => void submitPost()} disabled={busy || (!content.trim() && !selectedMediaIds.length) || !selectedChannelIds.length}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : postType === 'draft' ? <FileImage className="h-4 w-4" /> : postType === 'schedule' ? <CalendarDays className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    {busy ? 'Submitting…' : postType === 'draft' ? 'Save draft' : postType === 'schedule' ? 'Schedule post' : 'Publish now'}
                  </button>
                </div>
              </section>

              <aside className={panel + ' space-y-4 p-5'}>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Post preview</h3>
                  <p className="mt-1 text-xs text-slate-500">A simple preview of the content shared across selected channels.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-100 p-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-pink-400" />
                    <div><p className="text-xs font-semibold text-slate-800">{tenantName || 'Your brand'}</p><p className="text-[10px] text-slate-400">Preview</p></div>
                    <MoreHorizontal className="ml-auto h-4 w-4 text-slate-400" />
                  </div>
                  <div className="min-h-[150px] bg-slate-50 p-4">
                    {selectedMediaIds.length ? (
                      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                        <ImagePlus className="mr-2 h-5 w-5" /> {selectedMediaIds.length} media file{selectedMediaIds.length === 1 ? '' : 's'} selected
                      </div>
                    ) : (
                      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-400">Media preview will appear here</div>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap p-3 text-sm leading-6 text-slate-700">{content || <span className="text-slate-400">Your caption will appear here…</span>}</div>
                  <div className="border-t border-slate-100 p-3 text-[11px] text-slate-400">{selectedChannelIds.length ? selectedChannelIds.map((id) => channels.find((channel) => channel.id === id)?.name).filter(Boolean).join(' · ') : 'No channels selected'}</div>
                </div>
                {fileError && <p className="text-xs text-rose-600">{fileError}</p>}
                <button type="button" className={buttonSecondary + ' w-full'} onClick={() => setActiveTab('media')}><Upload className="h-4 w-4" /> Add media</button>
              </aside>
            </div>
          )}

          {activeTab === 'calendar' && (
            <section className={panel + ' overflow-hidden'}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div><h2 className="text-lg font-bold text-slate-900">Content calendar</h2><p className="mt-1 text-xs text-slate-500">Your scheduled, published and draft posts for this month.</p></div>
                <div className="flex items-center gap-2">
                  <button type="button" className={buttonSecondary} onClick={() => setCalendarMonth(new Date())}>Today</button>
                  <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Previous month" onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
                  <span className="min-w-[120px] text-center text-sm font-semibold text-slate-800">{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                  <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Next month" onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="px-1 py-3">{day}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {calendarCells.map((cell, index) => (
                  <div key={index} className={'min-h-[112px] border-b border-r border-slate-100 p-1.5 sm:min-h-[145px] sm:p-2 ' + (cell.date ? 'bg-white' : 'bg-slate-50/70')}>
                    {cell.date && (
                      <>
                        <button type="button" onClick={() => openComposeForDay(cell.date!)} className={'mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ' + (cell.date.toDateString() === new Date().toDateString() ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{cell.day}</button>
                        <div className="space-y-1">
                          {cell.posts.slice(0, 3).map((post, postIndex) => (
                            <button key={post.id || post.group || postIndex} type="button" onClick={() => setActiveTab('posts')} className="block w-full truncate rounded-md bg-blue-50 px-1.5 py-1 text-left text-[10px] font-medium text-blue-800 hover:bg-blue-100 sm:text-[11px]">{getPostText(post)}</button>
                          ))}
                          {cell.posts.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{cell.posts.length - 3} more</p>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2 p-4">
                <button type="button" className={buttonPrimary} onClick={() => setActiveTab('compose')}><Plus className="h-4 w-4" /> Create post</button>
              </div>
            </section>
          )}

          {activeTab === 'posts' && (
            <section className={panel + ' p-5'}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-bold text-slate-900">Posts</h2><p className="mt-1 text-sm text-slate-500">Drafts, scheduled publications and publishing history.</p></div>
                <button type="button" className={buttonPrimary} onClick={() => setActiveTab('compose')}><Plus className="h-4 w-4" /> Create post</button>
              </div>
              <div className="mt-5 space-y-3">
                {posts.map((post, index) => {
                  const state = getPostState(post);
                  const id = post.id || post.group || String(index);
                  const postUrl = post.releaseURL || post.posts?.find((item) => item.releaseURL)?.releaseURL;
                  return (
                    <article key={id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={'rounded-full border px-2 py-1 text-[10px] font-semibold ' + stateClass(state)}>{stateLabel(state)}</span>
                          <span className="text-xs text-slate-400">{formatDate(postDate(post))}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">{getPostText(post)}</p>
                        <p className="mt-2 text-xs text-slate-500">{getPostChannels(post).join(' · ') || 'Social channels'}</p>
                        {postUrl && <a href={postUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">View publication <ArrowUpRight className="h-3 w-3" /></a>}
                      </div>
                      {!state.includes('publish') && (
                        <button type="button" className="self-end rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:self-start" disabled={busy} onClick={() => void deletePost(post)} title="Delete draft or scheduled post"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </article>
                  );
                })}
                {!posts.length && <EmptyState title="No posts in this month" description="Create a draft, publish immediately or schedule your first post." action="Create a post" onClick={() => setActiveTab('compose')} />}
              </div>
            </section>
          )}

          {activeTab === 'media' && (
            <div className="space-y-5">
              <section className={panel + ' p-5'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-lg font-bold text-slate-900">Media library</h2><p className="mt-1 text-sm text-slate-500">Use Company Assets or upload a new image or video for social publishing.</p></div>
                  <label className={buttonPrimary + ' cursor-pointer'}>
                    {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload media
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4" className="hidden" disabled={uploadBusy} onChange={(event) => { void uploadNewFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  </label>
                </div>
                {fileError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{fileError}</p>}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {media.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                        {item.mimeType?.startsWith('video/') ? <Video className="h-8 w-8" /> : <ImagePlus className="h-8 w-8" />}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-800">{item.name || item.id}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{item.mimeType || 'Media'} · Uploaded {formatDate(item.createdAt)}</p>
                      <button type="button" className={buttonSecondary + ' mt-3 w-full'} onClick={() => { setSelectedMediaIds((previous) => previous.includes(item.id) ? previous.filter((id) => id !== item.id) : [...previous, item.id]); setActiveTab('compose'); }}>
                        {selectedMediaIds.includes(item.id) ? 'Selected for post' : 'Use in post'}
                      </button>
                    </div>
                  ))}
                  {!media.length && <div className="col-span-full"><EmptyState title="Your media library is empty" description="Import an existing Company Asset or upload an image or MP4 video." /></div>}
                </div>
              </section>
              <section className={panel + ' p-5'}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="text-sm font-bold text-slate-900">Company Assets</h3><p className="mt-1 text-xs text-slate-500">Only files that belong to this tenant are shown.</p></div>
                  <button type="button" className={buttonSecondary} onClick={() => void loadCompanyAssets()}><RefreshCw className="h-3.5 w-3.5" /> Refresh assets</button>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {companyAssets.slice(0, 12).map((asset) => (
                    <div key={asset.id} className="flex items-center gap-3 py-3">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-500">{asset.mimeType?.startsWith('video/') ? <Video className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{asset.name}</p><p className="text-[11px] text-slate-400">{asset.mimeType || asset.category || 'Asset'} · {bytesLabel(asset.size)}</p></div>
                      <button type="button" className={buttonSecondary} disabled={uploadBusy || media.some((item) => item.sourceAssetId === asset.id)} onClick={() => void importCompanyAsset(asset.id)}>{media.some((item) => item.sourceAssetId === asset.id) ? 'Uploaded' : 'Add to Social Studio'}</button>
                    </div>
                  ))}
                  {!companyAssets.length && <p className="py-4 text-xs text-slate-400">No Company Assets found. Upload a file above or add one in Workspace → Company Profile.</p>}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-400">Direct browser uploads are capped at 6 MB in this screen. For larger videos, use a server-side media upload path or add them to Company Assets first.</p>
              </section>
            </div>
          )}

          {activeTab === 'analytics' && (
            <section className={panel + ' p-5'}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-bold text-slate-900">Social analytics</h2><p className="mt-1 text-sm text-slate-500">Metrics are available only where the connected provider exposes them through its API.</p></div>
                <div className="flex flex-wrap gap-2">
                  <select className={inputClass + ' min-w-[190px]'} value={selectedAnalyticsChannel} onChange={(event) => setSelectedAnalyticsChannel(event.target.value)}>
                    {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name || providerName(channel.identifier)}</option>)}
                  </select>
                  <select className={inputClass + ' w-[130px]'} value={analyticsDays} onChange={(event) => setAnalyticsDays(event.target.value)}>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                  <button type="button" className={buttonPrimary} onClick={() => void loadAnalytics()} disabled={!selectedAnalyticsChannel || analyticsLoading}>{analyticsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Load analytics</button>
                </div>
              </div>
              {analytics ? (
                <>
                  <AnalyticsSummary analytics={analytics} />
                  {Array.isArray(analytics.limitations) && analytics.limitations.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                      <p className="text-xs font-semibold text-amber-900">Provider data notes</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-amber-900/80">
                        {analytics.limitations.map((note: string, index: number) => <li key={index}>{note}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <EmptyState title="Choose a channel to view analytics" description="Load the latest metrics available for the selected connected social account." />
                </div>
              )}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">Analytics availability and refresh frequency depend on each social platform and the permissions granted to the connected account. The numbers shown are the provider-reported metrics for the selected channel.</p>
            </section>
          )}

          {activeTab === 'competitors' && (
            <section className={panel + ' p-5'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold text-slate-900">Competitor intelligence</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">Track public profiles and recent public content. Private reach, impressions, audience demographics and private account analytics are not available through competitor APIs.</p></div>
              </div>
              <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                <label className="text-xs font-semibold text-slate-700">Platform
                  <select className={inputClass + ' mt-1'} value={competitorProvider} onChange={(event) => setCompetitorProvider(event.target.value)}>
                    {PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">Competitor handle / ID
                  <input className={inputClass + ' mt-1'} value={competitorHandle} onChange={(event) => setCompetitorHandle(event.target.value)} placeholder={competitorProvider === 'reddit' ? 'subreddit name' : 'username, channel ID or Page ID'} />
                </label>
                <div className="flex items-end"><button type="button" className={buttonPrimary} onClick={() => void addCompetitor()} disabled={competitorBusy || !competitorHandle.trim()}>{competitorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Track competitor</button></div>
              </div>
              <div className="mt-5 space-y-3">
                {competitors.map((competitor) => (
                  <article key={competitor.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{providerName(competitor.provider)} · {competitor.handle}</p><p className="mt-1 text-[11px] text-slate-400">{competitor.lastAnalyzedAt ? 'Last analyzed ' + formatDate(competitor.lastAnalyzedAt) : 'Not analyzed yet'}</p></div>
                      <button type="button" className={buttonSecondary} disabled={competitorBusy} onClick={() => void analyzeCompetitor(competitor.id)}><BarChart3 className="h-3.5 w-3.5" /> Analyze</button>
                      <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" disabled={competitorBusy} onClick={() => void deleteCompetitor(competitor.id)} title="Remove competitor"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {competitor.lastAnalysis && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-700">{JSON.stringify(competitor.lastAnalysis, null, 2)}</pre>}
                  </article>
                ))}
                {!competitors.length && <EmptyState title="No competitors tracked" description="Add a public profile, channel or subreddit to begin collecting API-supported competitor information." />}
              </div>
              {competitorAnalysis && (
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Latest competitor analysis</h3>
                  <pre className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{JSON.stringify(competitorAnalysis, null, 2)}</pre>
                </div>
              )}
              <p className="mt-4 text-[11px] leading-5 text-slate-400">Instagram Business Discovery and Facebook public Page content require Meta permissions and app review. LinkedIn competitor data is restricted by its Community Management program. Reddit competitor requests are disabled pending commercial Data API approval.</p>
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
        <span>Publishing service: Amaavigo Native Social Engine · Tenant-scoped connection</span>
        <span>Social platform policies and account eligibility apply.</span>
      </div>
    </div>
  );
};

const ChannelAvatar: React.FC<{ channel: Channel; small?: boolean }> = ({ channel, small = false }) => {
  const size = small ? 'h-8 w-8' : 'h-10 w-10';
  const provider = PROVIDERS.find((item) => item.id === channel.identifier);
  const Icon = channel.identifier.startsWith('instagram') ? Instagram : channel.identifier === 'linkedin' ? Linkedin : channel.identifier === 'youtube' ? Youtube : Share2;
  return (
    <div className={size + ' flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ' + (provider?.color || 'from-blue-600 to-indigo-500') + ' text-white'}>
      {channel.picture ? <img src={channel.picture} alt="" className="h-full w-full object-cover" /> : <Icon className={small ? 'h-4 w-4' : 'h-5 w-5'} />}
    </div>
  );
};

const ChannelRow: React.FC<{ channel: Channel }> = ({ channel }) => (
  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 p-3">
    <ChannelAvatar channel={channel} small />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{channel.name || providerName(channel.identifier)}</p><p className="truncate text-[11px] text-slate-400">{channel.profile || providerName(channel.identifier)}</p></div>
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  </div>
);

const QuickAction: React.FC<{ icon: React.ElementType; title: string; text: string; onClick: () => void }> = ({ icon: Icon, title, text, onClick }) => (
  <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/30">
    <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Icon className="h-4 w-4" /></span>
    <span><span className="block text-sm font-semibold text-slate-800">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{text}</span></span>
  </button>
);

const AnalyticsSummary: React.FC<{ analytics: any }> = ({ analytics }) => {
  const rows = Array.isArray(analytics)
    ? analytics
    : Array.isArray(analytics?.analytics)
      ? analytics.analytics
      : Array.isArray(analytics?.data)
        ? analytics.data
        : [];
  if (!rows.length) {
    return (
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{JSON.stringify(analytics, null, 2)}</pre>
      </div>
    );
  }
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((metric: any, index: number) => {
        const values = Array.isArray(metric?.data) ? metric.data : [];
        const latest = values.length ? values[values.length - 1] : null;
        const total = latest?.total ?? metric?.total ?? metric?.value ?? '—';
        const change = Number(metric?.percentageChange);
        return (
          <div key={metric?.label || index} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{String(metric?.label || metric?.name || 'Metric')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{String(total)}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>{latest?.date ? formatDate(latest.date) : 'Latest available'}</span>
              {Number.isFinite(change) && <span className={change >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>}
            </div>
            {values.length > 1 && (
              <div className="mt-3 flex h-10 items-end gap-1">
                {values.slice(-14).map((point: any, pointIndex: number) => {
                  const numeric = Math.max(0, Number(point?.total || 0));
                  const maximum = Math.max(1, ...values.slice(-14).map((item: any) => Number(item?.total || 0)));
                  return <span key={pointIndex} title={String(point?.date || '') + ': ' + String(point?.total || '')} className="flex-1 rounded-t bg-blue-200" style={{ height: Math.max(4, Math.round((numeric / maximum) * 38)) + 'px' }} />;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; description: string; action?: string; onClick?: () => void }> = ({ title, description, action, onClick }) => (
  <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
    <div className="rounded-xl bg-white p-3 text-slate-400 shadow-sm"><Share2 className="h-5 w-5" /></div>
    <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    {action && onClick && <button type="button" onClick={onClick} className="mt-3 text-xs font-semibold text-blue-700 hover:underline">{action}</button>}
  </div>
);

export default SocialStudioView;
