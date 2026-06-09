// AgentView shell 测试。核心是认证门 → tab UI 的状态切换。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/render';

vi.mock('./api', () => ({
  getToken:    vi.fn(),
  setToken:    vi.fn(),
  agentMe:     vi.fn(),
  agentLogout: vi.fn(),
  // 各 tab 也走 api 模块,避免渲染时打真网络
  listDocuments:            vi.fn().mockResolvedValue([]),
  listConversations:        vi.fn().mockResolvedValue([]),
  agentLogin:               vi.fn(),
  agentRegister:            vi.fn(),
  uploadDocument:           vi.fn(),
  deleteDocument:           vi.fn(),
  createConversation:       vi.fn(),
  getConversation:          vi.fn(),
  deleteConversation:       vi.fn(),
  listConversationMessages: vi.fn().mockResolvedValue([]),
  streamChat:               vi.fn(),
  submitAgentTask:          vi.fn(),
  streamRun:                vi.fn(() => () => undefined),
}));

import AgentView from './index';
import { agentLogout, agentMe, getToken } from './api';
import { authMeFixture } from './__fixtures__/agentServer';

const mGetTok  = vi.mocked(getToken);
const mMe      = vi.mocked(agentMe);
const mLogout  = vi.mocked(agentLogout);

beforeEach(() => { mGetTok.mockReset(); mMe.mockReset(); mLogout.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('<AgentView>', () => {
  it('无 token → 渲染 LoginGate(没 me 调用)', async () => {
    mGetTok.mockReturnValue(null);
    renderWithProviders(<AgentView />);
    expect(await screen.findByText(/登录 AI 助手/)).toBeInTheDocument();
    expect(mMe).not.toHaveBeenCalled();
  });

  it('有 token + /auth/me 成功 → 渲染 tabs(默认在 文档库)', async () => {
    mGetTok.mockReturnValue('T');
    mMe.mockResolvedValue(authMeFixture);

    renderWithProviders(<AgentView />);

    await waitFor(() => expect(mMe).toHaveBeenCalled());
    expect(await screen.findByText(authMeFixture.displayName)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /文档库/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /知识对话/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent 任务/ })).toBeInTheDocument();
  });

  it('有 token 但 /auth/me 401 → 回落到 LoginGate', async () => {
    mGetTok.mockReturnValue('STALE');
    mMe.mockRejectedValue(new Error('unauthorized'));

    renderWithProviders(<AgentView />);
    expect(await screen.findByText(/登录 AI 助手/)).toBeInTheDocument();
  });

  it('点 退出 → agentLogout 调用 + 回 LoginGate', async () => {
    mGetTok.mockReturnValue('T');
    mMe.mockResolvedValue(authMeFixture);
    const user = userEvent.setup();

    renderWithProviders(<AgentView />);
    await screen.findByText(authMeFixture.displayName);

    await user.click(screen.getByRole('button', { name: '退出' }));
    expect(mLogout).toHaveBeenCalled();
    expect(await screen.findByText(/登录 AI 助手/)).toBeInTheDocument();
  });

  it('已登录后切到知识对话 tab', async () => {
    mGetTok.mockReturnValue('T');
    mMe.mockResolvedValue(authMeFixture);
    const user = userEvent.setup();

    renderWithProviders(<AgentView />);
    await screen.findByText(authMeFixture.displayName);

    await user.click(screen.getByRole('button', { name: /知识对话/ }));
    expect(await screen.findByText(/选一个对话开始/)).toBeInTheDocument();
  });
});
