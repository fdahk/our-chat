// AgentView shell 测试。核心是一键鉴权(ensureAgentToken → agentMe)→ tab UI 的状态切换。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/render';

vi.mock('./agentAuth', () => ({
  ensureAgentToken: vi.fn(),
}));

vi.mock('./api', () => ({
  agentMe: vi.fn(),
  // 各 tab 也走 api 模块,避免渲染时打真网络
  listDocuments:            vi.fn().mockResolvedValue([]),
  listConversations:        vi.fn().mockResolvedValue([]),
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
import { agentMe } from './api';
import { ensureAgentToken } from './agentAuth';
import { authMeFixture } from './__fixtures__/agentServer';

const mEnsure = vi.mocked(ensureAgentToken);
const mMe     = vi.mocked(agentMe);

beforeEach(() => { mEnsure.mockReset(); mMe.mockReset(); });

describe('<AgentView>', () => {
  it('一键鉴权成功 → 渲染 tabs(默认在 文档库)+ 用户名', async () => {
    mEnsure.mockResolvedValue('TOKEN');
    mMe.mockResolvedValue(authMeFixture);

    renderWithProviders(<AgentView />);

    await waitFor(() => expect(mMe).toHaveBeenCalled());
    expect(await screen.findByText(authMeFixture.displayName)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /文档库/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /知识对话/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent 任务/ })).toBeInTheDocument();
  });

  it('铸 token 失败(our-chat 会话失效)→ 显示 authError,不调 agentMe', async () => {
    mEnsure.mockRejectedValue(new Error('mint failed'));

    renderWithProviders(<AgentView />);

    expect(await screen.findByText(/需要先登录 our-chat/)).toBeInTheDocument();
    expect(mMe).not.toHaveBeenCalled();
  });

  it('铸 token 成功但验活 401 → 显示 authError', async () => {
    mEnsure.mockResolvedValue('STALE');
    mMe.mockRejectedValue(new Error('unauthorized'));

    renderWithProviders(<AgentView />);

    expect(await screen.findByText(/需要先登录 our-chat/)).toBeInTheDocument();
  });

  it('已登录后切到知识对话 tab', async () => {
    mEnsure.mockResolvedValue('TOKEN');
    mMe.mockResolvedValue(authMeFixture);
    const user = userEvent.setup();

    renderWithProviders(<AgentView />);
    await screen.findByText(authMeFixture.displayName);

    await user.click(screen.getByRole('button', { name: /知识对话/ }));
    expect(await screen.findByText(/选一个对话开始/)).toBeInTheDocument();
  });
});
