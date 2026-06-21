// ConversationsTab 组件测试。覆盖:
//   - empty 态 + pickOne 占位
//   - 选中对话拉历史
//   - 新建对话
//   - 流式发送:placeholder 出现 → token 累加 → done 固化 citations
//   - 流式 error 移除 placeholder
//
// 重点是流式状态机 ── streamChat 是 AsyncGenerator,组件靠 for-await 消费 + 累加 content,
// 这条路径手测覆盖不到,必须 unit 测。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import type { ChatStreamEvent } from '../../type';

vi.mock('../../api', () => ({
  listConversations:        vi.fn(),
  createConversation:       vi.fn(),
  getConversation:          vi.fn(),
  deleteConversation:       vi.fn(),
  listConversationMessages: vi.fn(),
  streamChat:               vi.fn(),
}));

import ConversationsTab from './index';
import {
  createConversation,
  deleteConversation,
  listConversationMessages,
  listConversations,
  streamChat,
} from '../../api';
import type { AgentConversation, AgentMessage } from '../../type';
import { conversationFixture, userMsgFixture } from '../../__fixtures__/agentServer';

const mList   = vi.mocked(listConversations);
const mCreate = vi.mocked(createConversation);
const mMsgs   = vi.mocked(listConversationMessages);
const mDel    = vi.mocked(deleteConversation);
const mStream = vi.mocked(streamChat);

const conv = (over: Partial<AgentConversation> = {}): AgentConversation =>
  ({ ...conversationFixture, ...over });

const msg = (over: Partial<AgentMessage>): AgentMessage =>
  ({ ...userMsgFixture, ...over });

// 把数组包成 AsyncGenerator,模拟 streamChat 的返回
function asGen(events: ChatStreamEvent[]) {
  return (async function* () { for (const e of events) yield e; })();
}

beforeEach(() => {
  [mList, mCreate, mMsgs, mDel, mStream].forEach((m) => m.mockReset());
  mList.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('<ConversationsTab>', () => {
  it('初次渲染 empty + pickOne 占位', async () => {
    renderWithProviders(<ConversationsTab />);
    await waitFor(() => expect(mList).toHaveBeenCalled());
    expect(screen.getByText('还没有对话')).toBeInTheDocument();
    expect(screen.getByText(/选一个对话开始/)).toBeInTheDocument();
  });

  it('点新建 → 调 createConversation,列表多一项,自动选中', async () => {
    const user = userEvent.setup();
    mCreate.mockResolvedValue(conv({ id: 42, title: '新对话' }));
    mMsgs.mockResolvedValue([]);

    renderWithProviders(<ConversationsTab />);
    await waitFor(() => expect(mList).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /新建/ }));

    await waitFor(() => expect(mCreate).toHaveBeenCalled());
    expect(await screen.findByText('新对话')).toBeInTheDocument();
    // 自动选中 → firstMsgHint 出现
    expect(await screen.findByText(/问个问题试试/)).toBeInTheDocument();
  });

  it('选中已有对话拉历史', async () => {
    const user = userEvent.setup();
    mList.mockResolvedValue([conv({ id: 1, title: 'chat-1' })]);
    mMsgs.mockResolvedValue([
      msg({ id: 10, role: 'user', content: 'hello' }),
      msg({ id: 11, role: 'assistant', content: 'hi back' }),
    ]);

    renderWithProviders(<ConversationsTab />);
    await user.click(await screen.findByText('chat-1'));

    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(await screen.findByText('hi back')).toBeInTheDocument();
    expect(mMsgs).toHaveBeenCalledWith(1);
  });

  it('流式发送:用户消息立刻显,assistant token 逐步累加,done 后留住内容', async () => {
    const user = userEvent.setup();
    mList.mockResolvedValue([conv({ id: 1 })]);
    mMsgs.mockResolvedValue([]);
    mStream.mockReturnValue(asGen([
      { type: 'token', value: 'Hel' },
      { type: 'token', value: 'lo!' },
      { type: 'done', messageId: 999, citations: [
        { chunkId: 1, documentId: 5, score: 0.91, filename: 'a.pdf' },
      ]},
    ]));

    renderWithProviders(<ConversationsTab />);
    await user.click(await screen.findByText(/聊天 1/));

    const ta = await screen.findByPlaceholderText(/问点什么/);
    await user.type(ta, 'what is X?');
    await user.keyboard('{Enter}');

    // 用户消息出现
    expect(await screen.findByText('what is X?')).toBeInTheDocument();

    // assistant 累加完成
    expect(await screen.findByText('Hello!')).toBeInTheDocument();

    // citations 渲染
    expect(await screen.findByText(/a\.pdf/)).toBeInTheDocument();

    // 调用契约
    expect(mStream).toHaveBeenCalledWith(1, 'what is X?', 6, expect.anything());
  });

  it('流式 error:placeholder 被移除,用户消息保留', async () => {
    const user = userEvent.setup();
    mList.mockResolvedValue([conv({ id: 1 })]);
    mMsgs.mockResolvedValue([]);
    mStream.mockReturnValue(asGen([
      { type: 'token', value: 'partial' },
      { type: 'error', message: 'llm failed' },
    ]));

    renderWithProviders(<ConversationsTab />);
    await user.click(await screen.findByText(/聊天 1/));

    const ta = await screen.findByPlaceholderText(/问点什么/);
    await user.type(ta, 'q');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('q')).toBeInTheDocument();
    // placeholder 应该被移除 ── 找不到 partial 内容
    await waitFor(() => expect(screen.queryByText('partial')).not.toBeInTheDocument());
  });

  it('删除对话:confirm 后调 deleteConversation', async () => {
    const user = userEvent.setup();
    mList.mockResolvedValue([conv({ id: 5, title: 'kill-me' })]);
    mDel.mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    renderWithProviders(<ConversationsTab />);
    await screen.findByText('kill-me');

    await user.click(screen.getByRole('button', { name: /delete/ }));
    await waitFor(() => expect(mDel).toHaveBeenCalledWith(5));
  });
});
